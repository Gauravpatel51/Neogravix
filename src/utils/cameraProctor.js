/**
 * Client-side Camera Proctoring & Frame Analysis Engine.
 * Captures video frames, computes lighting/variance, detects face presence,
 * estimates head pose, drives the ProctoringStateMachine, and captures small snapshots (<=20KB).
 */

import { PROCTORING_CONFIG } from '../config/proctoring.js';
import { ProctoringStateMachine } from './proctoringStateMachine.js';

export class CameraProctor {
  constructor({
    videoElement = null,
    onViolation = () => {},
    onStateChange = () => {},
    onFallbackToWithoutCamera = () => {},
    initialViolationCount = 0
  } = {}) {
    this.videoElement = videoElement;
    this.onViolation = onViolation;
    this.onStateChange = onStateChange;
    this.onFallbackToWithoutCamera = onFallbackToWithoutCamera;

    this.stateMachine = new ProctoringStateMachine(PROCTORING_CONFIG);
    this.stateMachine.setViolationCount(initialViolationCount);

    this.stream = null;
    this.intervalId = null;
    this.isRunning = false;
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
    this.faceDetector = null;
  }

  /**
   * Initializes webcam stream and starts real-time proctoring.
   */
  async start() {
    if (this.isRunning) return;

    // 1. Check getUserMedia support
    if (!navigator?.mediaDevices?.getUserMedia) {
      console.warn('[CameraProctor] getUserMedia not supported on this browser.');
      this.onFallbackToWithoutCamera({ reason: 'unsupported' });
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: PROCTORING_CONFIG.SNAPSHOT_WIDTH },
          height: { ideal: PROCTORING_CONFIG.SNAPSHOT_HEIGHT },
          facingMode: 'user'
        },
        audio: false
      });

      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        this.videoElement.playsInline = true;
        this.videoElement.muted = true;
        await this.videoElement.play().catch(e => console.warn('[CameraProctor] play() note:', e));
      }
    } catch (err) {
      console.warn('[CameraProctor] Failed to acquire camera stream:', err);
      this.onFallbackToWithoutCamera({ reason: 'permission_or_device_error', error: err });
      return;
    }

    // 2. Initialize offscreen analysis canvas
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = PROCTORING_CONFIG.SNAPSHOT_WIDTH;
    this.offscreenCanvas.height = PROCTORING_CONFIG.SNAPSHOT_HEIGHT;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });

    // 3. Initialize Face Detector (Shape Detection API or lightweight heuristic fallback)
    try {
      if (typeof window !== 'undefined' && 'FaceDetector' in window) {
        this.faceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 4 });
      }
    } catch (e) {
      console.warn('[CameraProctor] Native FaceDetector unavailable, using heuristic fallback:', e);
    }

    this.isRunning = true;
    this.stateMachine.reset(Date.now(), this.stateMachine.getViolationCount());

    // 4. Start analysis loop
    this.intervalId = setInterval(() => {
      this._analyzeCurrentFrame().catch(err => {
        console.warn('[CameraProctor] Frame analysis error:', err);
      });
    }, PROCTORING_CONFIG.FRAME_INTERVAL_MS);
  }

  /**
   * Captures and evaluates a single frame from the video element.
   */
  async _analyzeCurrentFrame() {
    if (!this.isRunning || !this.videoElement || this.videoElement.readyState < 2) {
      return;
    }

    const { videoWidth, videoHeight } = this.videoElement;
    if (!videoWidth || !videoHeight) return;

    // Draw frame to canvas
    this.offscreenCtx.drawImage(
      this.videoElement,
      0, 0,
      this.offscreenCanvas.width,
      this.offscreenCanvas.height
    );

    // Compute pixel luminosity and variance for covered lens detection
    const imgData = this.offscreenCtx.getImageData(
      0, 0,
      this.offscreenCanvas.width,
      this.offscreenCanvas.height
    );
    const { brightness, variance } = this._computeImageMetrics(imgData);

    // Face detection & head pose estimation
    const detectionResult = await this._detectFaces(imgData);

    const timestamp = Date.now();
    const frameResult = this.stateMachine.processFrame({
      timestamp,
      faceCount: detectionResult.faceCount,
      headPose: detectionResult.headPose,
      brightness,
      variance
    });

    // Notify UI of status changes
    this.onStateChange(frameResult);

    // If a violation was triggered, capture snapshot and notify
    if (frameResult.status === 'violation' && frameResult.violationType) {
      const snapshotBase64 = this._captureSnapshotJpeg();
      this.onViolation({
        violationType: frameResult.violationType,
        violationCount: frameResult.violationCount,
        autoSubmit: frameResult.autoSubmit,
        snapshotBase64,
        timestamp
      });
    }
  }

  /**
   * Detects faces and estimates head pose using available detector or pixel heuristics.
   */
  async _detectFaces(imgData) {
    if (this.faceDetector) {
      try {
        const detectedFaces = await this.faceDetector.detect(this.offscreenCanvas);
        if (detectedFaces && detectedFaces.length > 0) {
          const primary = detectedFaces[0];
          const headPose = this._estimateHeadPoseFromLandmarks(primary);
          return { faceCount: detectedFaces.length, headPose };
        }
        return { faceCount: 0, headPose: { yaw: 0, pitch: 0 } };
      } catch (err) {
        // Fall back to heuristic if detector threw error
      }
    }

    // Heuristic face presence & centroid detector based on skin color and face contrast
    return this._detectFaceHeuristic(imgData);
  }

  _estimateHeadPoseFromLandmarks(face) {
    // If landmarks (eyes, nose, mouth) are available from FaceDetector:
    if (face.landmarks && face.landmarks.length >= 2) {
      const eyePoints = face.landmarks.filter(l => l.type === 'eye');
      const mouthPoints = face.landmarks.filter(l => l.type === 'mouth');
      const nosePoints = face.landmarks.filter(l => l.type === 'nose');

      if (eyePoints.length === 2) {
        const [leftEye, rightEye] = eyePoints;
        const eyeCenter = (leftEye.location.x + rightEye.location.x) / 2;
        const boxCenter = face.boundingBox.x + face.boundingBox.width / 2;
        const normalizedYaw = (eyeCenter - boxCenter) / (face.boundingBox.width / 2);
        const yaw = normalizedYaw * 45; // Approx degrees

        let pitch = 0;
        if (mouthPoints.length > 0) {
          const eyeY = (leftEye.location.y + rightEye.location.y) / 2;
          const mouthY = mouthPoints[0].location.y;
          const eyeMouthDist = mouthY - eyeY;
          const expectedRatio = face.boundingBox.height * 0.45;
          pitch = (expectedRatio - eyeMouthDist) * 0.8;
        }

        return { yaw, pitch };
      }
    }

    // Centroid offset inside bounding box
    const box = face.boundingBox;
    const canvasCenterX = this.offscreenCanvas.width / 2;
    const canvasCenterY = this.offscreenCanvas.height / 2;
    const faceCenterX = box.x + box.width / 2;
    const faceCenterY = box.y + box.height / 2;

    const yaw = ((faceCenterX - canvasCenterX) / canvasCenterX) * 35;
    const pitch = ((canvasCenterY - faceCenterY) / canvasCenterY) * 30;

    return { yaw, pitch };
  }

  _detectFaceHeuristic(imgData) {
    const data = imgData.data;
    const w = imgData.width;
    const h = imgData.height;
    let skinPixels = 0;
    let sumX = 0;
    let sumY = 0;

    // Scan every 4th pixel for performance
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Standard skin-tone range in RGB
      if (r > 70 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
        skinPixels++;
        const pixelIdx = i / 4;
        sumX += pixelIdx % w;
        sumY += Math.floor(pixelIdx / w);
      }
    }

    const minSkinThreshold = (w * h * 0.035) / 4;
    if (skinPixels < minSkinThreshold) {
      return { faceCount: 0, headPose: { yaw: 0, pitch: 0 } };
    }

    const avgX = sumX / skinPixels;
    const avgY = sumY / skinPixels;
    const yaw = ((avgX - w / 2) / (w / 2)) * 40;
    const pitch = ((h / 2 - avgY) / (h / 2)) * 30;

    return { faceCount: 1, headPose: { yaw, pitch } };
  }

  _computeImageMetrics(imgData) {
    const data = imgData.data;
    let sumLuma = 0;
    let sumSqDiff = 0;
    const sampleStep = 8;
    let samples = 0;

    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      // Perceived luminosity
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sumLuma += luma;
      samples++;
    }

    const brightness = sumLuma / samples;

    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sumSqDiff += (luma - brightness) * (luma - brightness);
    }

    const variance = Math.sqrt(sumSqDiff / samples);
    return { brightness, variance };
  }

  /**
   * Generates a compressed JPEG snapshot <= 20 KB.
   */
  _captureSnapshotJpeg() {
    if (!this.offscreenCanvas) return null;

    let quality = PROCTORING_CONFIG.SNAPSHOT_QUALITY;
    let dataUrl = this.offscreenCanvas.toDataURL('image/jpeg', quality);

    // Approximate byte size from base64 length: (len * 3/4)
    let byteSize = Math.round((dataUrl.length - 22) * 0.75);

    // If exceeding 20KB, compress further
    if (byteSize > PROCTORING_CONFIG.SNAPSHOT_MAX_SIZE_KB * 1024) {
      quality = 0.25;
      dataUrl = this.offscreenCanvas.toDataURL('image/jpeg', quality);
    }

    return dataUrl;
  }

  setViolationCount(count) {
    this.stateMachine.setViolationCount(count);
  }

  getViolationCount() {
    return this.stateMachine.getViolationCount();
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }
}
