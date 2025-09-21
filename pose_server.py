# pose_server.py
from flask import Flask, request, jsonify
import mediapipe as mp
import cv2
import numpy as np
from PIL import Image
import io, math

app = Flask(__name__)
mp_pose = mp.solutions.pose

def read_image_from_file_storage(file_storage):
    """
    Read uploaded file (werkzeug FileStorage) -> BGR numpy image (OpenCV)
    """
    data = file_storage.read()
    img = Image.open(io.BytesIO(data)).convert('RGB')
    arr = np.array(img)  # RGB
    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    return bgr

def angle_between(A, B, C):
    """
    Angle ABC (in degrees) at point B between BA and BC
    """
    BA = (A[0] - B[0], A[1] - B[1])
    BC = (C[0] - B[0], C[1] - B[1])
    dot = BA[0]*BC[0] + BA[1]*BC[1]
    magBA = math.hypot(BA[0], BA[1])
    magBC = math.hypot(BC[0], BC[1])
    if magBA == 0 or magBC == 0:
        return None
    cosv = max(-1.0, min(1.0, dot / (magBA * magBC)))
    return math.degrees(math.acos(cosv))

@app.route('/analyze', methods=['POST'])
def analyze():
    """
    POST /analyze
    form-data:
      image: file (jpg/png)
      sessionId: optional
      lang: optional 'en' or 'hi'
    """
    if 'image' not in request.files:
        return jsonify({'error': 'Missing image file'}), 400

    f = request.files['image']
    lang = request.form.get('lang', 'en')

    try:
        img_bgr = read_image_from_file_storage(f)
    except Exception as e:
        return jsonify({'error': 'Failed to decode image', 'detail': str(e)}), 400

    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    with mp_pose.Pose(static_image_mode=True, model_complexity=1) as pose:
        results = pose.process(img_rgb)

    if not results.pose_landmarks:
        msg = 'No person detected. Please upload a clear image showing face and shoulders.' if lang == 'en' \
              else 'चित्र में कोई व्यक्ति स्पष्ट रूप से नहीं मिला। कृपया साफ तस्वीर भेजें।'
        return jsonify({
            'type': 'analysis',
            'posture': 'No person detected',
            'score': 0,
            'notes': msg,
            'recommendations': []
        })

    # Get image dims
    h, w, _ = img_rgb.shape

    # Helper to get (x,y,visibility) for landmark name
    def lm(name):
        l = getattr(mp_pose.PoseLandmark, name)
        lm = results.pose_landmarks.landmark[l]
        return (lm.x * w, lm.y * h, lm.visibility)

    # Extract key landmarks if available
    try:
        nose = lm('NOSE')
        left_eye = lm('LEFT_EYE')
        right_eye = lm('RIGHT_EYE')
        left_shoulder = lm('LEFT_SHOULDER')
        right_shoulder = lm('RIGHT_SHOULDER')
        left_hip = lm('LEFT_HIP')
        right_hip = lm('RIGHT_HIP')
    except Exception:
        return jsonify({
            'type': 'analysis',
            'posture': 'Low confidence detection',
            'score': 25,
            'notes': 'Key landmarks missing — try a clearer photo.',
            'recommendations': []
        })

    # Confidence thresholds
    vis_thresh = 0.2
    if (nose[2] < vis_thresh) or (left_shoulder[2] < vis_thresh and right_shoulder[2] < vis_thresh):
        msg = 'Low confidence in detection (face or shoulders not clear).' if lang == 'en' else 'डिटेक्शन का भरोसा कम है (चेहरा या कंधे स्पष्ट नहीं)।'
        return jsonify({'type':'analysis','posture':'Low confidence detection','score':30,'notes':msg,'recommendations':[]})

    # Compute shoulder midpoint and hip midpoint
    shoulder_mid = ((left_shoulder[0] + right_shoulder[0]) / 2.0, (left_shoulder[1] + right_shoulder[1]) / 2.0)
    hip_mid = ((left_hip[0] + right_hip[0]) / 2.0, (left_hip[1] + right_hip[1]) / 2.0)

    # Forward head angle: angle at shoulder_mid between nose and hip_mid
    forward_head_angle = angle_between((nose[0], nose[1]), shoulder_mid, hip_mid)

    # Shoulder slope: angle of the line from left_shoulder -> right_shoulder relative to horizontal
    dx = right_shoulder[0] - left_shoulder[0]
    dy = right_shoulder[1] - left_shoulder[1]
    shoulder_slope_deg = math.degrees(math.atan2(dy, dx))  # 0 = level, >0 right shoulder lower

    # Heuristic scoring
    score = 80
    if forward_head_angle is not None:
        if forward_head_angle < 75:
            score -= (75 - forward_head_angle) * 0.6
    if shoulder_slope_deg is not None:
        score -= min(20, abs(shoulder_slope_deg) * 0.6)
    score = int(max(0, min(100, round(score))))

    # Decide posture labels and recommendations
    recommendations = []
    posture_label = 'Neutral'
    if forward_head_angle is not None and forward_head_angle < 70:
        posture_label = 'Forward head'
        rec = {
            'title': 'Chin Tuck' if lang == 'en' else 'Chin Tuck',
            'detail': 'Gently tuck your chin and hold for 5 seconds. Repeat 8–10 times.' if lang == 'en' \
                      else 'धीरे-धीरे ठोड़ी को अंदर की ओर खींचें और 5 सेकंड रखें। 8-10 बार दोहराएँ।'
        }
        recommendations.append(rec)

    if abs(shoulder_slope_deg) > 8:
        if posture_label == 'Neutral':
            posture_label = 'Rounded/uneven shoulders'
        rec2 = {
            'title': 'Shoulder Blade Squeeze' if lang == 'en' else 'Shoulder Blade Squeeze',
            'detail': 'Squeeze shoulder blades together, hold 3–5 seconds. Repeat 8–10 times.' if lang == 'en' \
                      else 'कंधे पीछे की ओर सिकोड़ें और 3-5 सेकंड रखें। 8-10 बार दोहराएँ।'
        }
        recommendations.append(rec2)

    if not recommendations:
        recommendations.append({
            'title': 'Posture Maintenance' if lang == 'en' else 'स्थिति बनाए रखें',
            'detail': 'Keep upright posture; avoid staying in one position for too long.' if lang == 'en' \
                      else 'सही मुद्रा बनाए रखें; लंबे समय तक एक ही स्थिति न रखें।'
        })

    # Build debug keypoints (rounded)
    keypoints_debug = {
        'nose': {'x': round(nose[0]), 'y': round(nose[1]), 'vis': round(nose[2], 2)},
        'left_shoulder': {'x': round(left_shoulder[0]), 'y': round(left_shoulder[1]), 'vis': round(left_shoulder[2], 2)},
        'right_shoulder': {'x': round(right_shoulder[0]), 'y': round(right_shoulder[1]), 'vis': round(right_shoulder[2], 2)},
        'hip_mid': {'x': round(hip_mid[0]), 'y': round(hip_mid[1])}
    }

    response = {
        'type': 'analysis',
        'posture': posture_label,
        'score': score,
        'notes': 'Posture analysis complete — suggestions below.' if lang == 'en' else 'पोस्टर विश्लेषण पूरा हुआ — सुझाव नीचे दिए गए हैं।',
        'recommendations': recommendations,
        'debug': {
            'forwardHeadAngle': round(forward_head_angle, 1) if forward_head_angle else None,
            'shoulderSlopeDeg': round(shoulder_slope_deg, 1) if shoulder_slope_deg else None,
            'keypoints': keypoints_debug
        }
    }

    return jsonify(response), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
