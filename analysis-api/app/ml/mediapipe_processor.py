import cv2
import mediapipe as mp
import numpy as np
import base64

mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# Eye Aspect Ratio (EAR) indices
LEFT_EYE = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]

def calculate_ear(eye_landmarks, landmarks):
    # Calculate vertical distances
    v1 = np.linalg.norm(np.array([landmarks[eye_landmarks[1]].x, landmarks[eye_landmarks[1]].y]) - 
                        np.array([landmarks[eye_landmarks[5]].x, landmarks[eye_landmarks[5]].y]))
    v2 = np.linalg.norm(np.array([landmarks[eye_landmarks[2]].x, landmarks[eye_landmarks[2]].y]) - 
                        np.array([landmarks[eye_landmarks[4]].x, landmarks[eye_landmarks[4]].y]))
    # Calculate horizontal distance
    h = np.linalg.norm(np.array([landmarks[eye_landmarks[0]].x, landmarks[eye_landmarks[0]].y]) - 
                       np.array([landmarks[eye_landmarks[3]].x, landmarks[eye_landmarks[3]].y]))
    
    ear = (v1 + v2) / (2.0 * h)
    return ear

def process_frame(frame_base64: str) -> dict:
    """Process a single base64 video frame with MediaPipe Face Mesh.
    Returns head pose and EAR scores.
    """
    try:
        # Decode base64 frame (strip header if exists)
        if "," in frame_base64:
            frame_base64 = frame_base64.split(",")[1]
            
        img_bytes = base64.b64decode(frame_base64)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return {"face_present": False}

        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(img_rgb)

        if not results.multi_face_landmarks:
            return {"face_present": False}

        landmarks = results.multi_face_landmarks[0].landmark

        # Calculate EAR (Eye Aspect Ratio) for drowsiness/attention
        left_ear = calculate_ear(LEFT_EYE, landmarks)
        right_ear = calculate_ear(RIGHT_EYE, landmarks)
        avg_ear = (left_ear + right_ear) / 2.0
        
        # Normalize EAR score (typically 0.2 is closed, 0.3+ is open)
        ear_score = min(1.0, max(0.0, (avg_ear - 0.2) / 0.1))

        # Calculate Head Pose (pitch, yaw, roll approximation)
        img_h, img_w, _ = img.shape
        face_3d = []
        face_2d = []
        
        # 33 = nose tip, 263 = left eye corner, 33 = right eye corner, 152 = chin, 10 = top head
        key_indices = [33, 263, 1, 61, 291, 199] 
        
        for idx in key_indices:
            lm = landmarks[idx]
            x, y = int(lm.x * img_w), int(lm.y * img_h)
            face_2d.append([x, y])
            face_3d.append([x, y, lm.z])
            
        face_2d = np.array(face_2d, dtype=np.float64)
        face_3d = np.array(face_3d, dtype=np.float64)

        focal_length = 1 * img_w
        cam_matrix = np.array([
            [focal_length, 0, img_w / 2],
            [0, focal_length, img_h / 2],
            [0, 0, 1]
        ])
        dist_matrix = np.zeros((4, 1), dtype=np.float64)

        success, rot_vec, trans_vec = cv2.solvePnP(face_3d, face_2d, cam_matrix, dist_matrix)
        rmat, _ = cv2.Rodrigues(rot_vec)
        angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)

        x_angle = angles[0] * 360  # Pitch (Up/Down)
        y_angle = angles[1] * 360  # Yaw (Left/Right)
        
        # Calculate Head Pose Score (closer to 0 is better, max penalty at 30 degrees)
        pitch_penalty = min(1.0, abs(x_angle) / 30.0)
        yaw_penalty = min(1.0, abs(y_angle) / 30.0)
        head_pose_score = max(0.0, 1.0 - ((pitch_penalty + yaw_penalty) / 2.0))
        
        # Visual score is a combination of EAR and Head Pose
        visual_score = (ear_score * 0.4) + (head_pose_score * 0.6)

        return {
            "face_present": True,
            "ear_score": ear_score,
            "head_pose_score": head_pose_score,
            "visual_score": visual_score
        }
    except Exception as e:
        print(f"MediaPipe processing error: {e}")
        return {"face_present": False}
