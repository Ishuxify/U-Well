# utils.py - Complete MediaPipe posture analysis for U-Well
import cv2
import mediapipe as mp
import numpy as np
from math import degrees, atan2
from PIL import Image
import io
import base64
import time
import traceback
import json

def analyze_posture(image_bytes, lang='en'):
    """
    Analyze image for posture using MediaPipe Pose detection
    Returns: dict with analysis results and recommendations (JSON serializable)
    """
    try:
        print(f"[UTILS] Starting posture analysis - lang: {lang}")
        
        # Handle different input types
        if isinstance(image_bytes, str):
            # Base64 encoded string
            try:
                image_bytes = base64.b64decode(image_bytes)
                print("[UTILS] Successfully decoded base64 image")
            except Exception as e:
                print(f"[UTILS] Base64 decode failed: {e}, treating as raw bytes")
                image_bytes = image_bytes.encode('utf-8')  # Fallback
        
        # Decode image bytes to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            error_msg = "Failed to decode image - invalid format or corrupted file"
            print(f"[UTILS] {error_msg}")
            base_response = {
                'score': 0,
                'posture_type': 'decode_error',
                'confidence': 0.0,
                'analysis_timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
            }
            if lang == 'hi':
                base_response.update({
                    'summary': 'इमेज डिकोड नहीं हो सकी।',
                    'recommendations': ['JPG/PNG फॉर्मेट में साफ़ तस्वीर लें।', 'फ़ाइल साइज़ 5MB से कम रखें।'],
                    'notes': 'इमेज फाइल डैमेज्ड या गलत फॉर्मेट।'
                })
            else:
                base_response.update({
                    'summary': 'Could not decode image.',
                    'recommendations': ['Use JPG/PNG format with clear image.', 'Keep file size under 5MB.'],
                    'notes': 'Image file damaged or wrong format.'
                })
            return base_response
        
        height, width, _ = img.shape
        print(f"[UTILS] Image loaded successfully - {width}x{height} pixels")
        
        # Initialize MediaPipe Pose
        mp_pose = mp.solutions.pose
        pose = mp_pose.Pose(
            static_image_mode=True,
            model_complexity=1,
            enable_segmentation=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        
        # Convert BGR to RGB for MediaPipe
        rgb_image = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = pose.process(rgb_image)
        
        # Clean up MediaPipe resources
        pose.close()
        
        if not results.pose_landmarks:
            print("[UTILS] No pose landmarks detected - poor visibility or no person")
            base_response = {
                'score': 0,
                'posture_type': 'no_pose',
                'confidence': 0.0,
                'analysis_timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
            }
            if lang == 'hi':
                base_response.update({
                    'summary': 'पोज़ डिटेक्ट नहीं हुई।',
                    'recommendations': [
                        'साफ़, पूरी बॉडी वाली तस्वीर लें जिसमें व्यक्ति दिखे।',
                        'अच्छी लाइटिंग में फोटो लें।',
                        'फेस और बॉडी दोनों स्पष्ट दिखें।'
                    ],
                    'notes': 'कोई व्यक्ति या पोज़ नहीं मिली। बेहतर तस्वीर आज़माएं।'
                })
            else:
                base_response.update({
                    'summary': 'No pose detected.',
                    'recommendations': [
                        'Try a clear, full-body photo showing a person.',
                        'Use good lighting.',
                        'Make sure face and body are both visible.'
                    ],
                    'notes': 'No person or pose found. Please try a better photo.'
                })
            return base_response
        
        print(f"[UTILS] Pose detected successfully - {len(results.pose_landmarks.landmark)} landmarks found")
        
        # Extract landmark coordinates (convert normalized to pixel coordinates)
        landmarks = results.pose_landmarks.landmark
        
        def get_landmark(idx):
            try:
                lm = landmarks[idx]
                x = lm.x * width
                y = lm.y * height
                z = lm.z * width  # Scale z similarly
                visibility = lm.visibility
                return {
                    'x': float(x),
                    'y': float(y),
                    'z': float(z),
                    'visibility': float(visibility)
                }
            except (IndexError, AttributeError):
                return None
        
        # Extract key landmarks for analysis
        landmark_data = {
            'left_shoulder': get_landmark(mp_pose.PoseLandmark.LEFT_SHOULDER.value),
            'right_shoulder': get_landmark(mp_pose.PoseLandmark.RIGHT_SHOULDER.value),
            'left_hip': get_landmark(mp_pose.PoseLandmark.LEFT_HIP.value),
            'right_hip': get_landmark(mp_pose.PoseLandmark.RIGHT_HIP.value),
            'nose': get_landmark(mp_pose.PoseLandmark.NOSE.value),
            'left_eye': get_landmark(mp_pose.PoseLandmark.LEFT_EYE_INNER.value),
            'right_eye': get_landmark(mp_pose.PoseLandmark.RIGHT_EYE_INNER.value)
        }
        
        # Validate critical landmarks
        required_landmarks = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip']
        missing_landmarks = [lm for lm in required_landmarks if landmark_data[lm] is None]
        
        if missing_landmarks:
            print(f"[UTILS] Missing landmarks: {missing_landmarks}")
            base_response = {
                'score': 0,
                'posture_type': 'missing_landmarks',
                'confidence': 0.0,
                'analysis_timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
                'missing_landmarks': missing_landmarks
            }
            if lang == 'hi':
                base_response.update({
                    'summary': 'कुछ मुख्य बॉडी पॉइंट्स नहीं मिले।',
                    'recommendations': ['पूरी बॉडी स्पष्ट दिखाने वाली तस्वीर लें।', 'अधिक landmarks के लिए बेहतर कोण आज़माएं।'],
                    'notes': f'मुख्य पॉइंट्स गायब: {", ".join(missing_landmarks)}'
                })
            else:
                base_response.update({
                    'summary': 'Some key body points not found.',
                    'recommendations': ['Try a full-body photo with clear visibility.', 'Use a different angle for better landmark detection.'],
                    'notes': f'Missing points: {", ".join(missing_landmarks)}'
                })
            return base_response
        
        # Extract coordinates for calculations
        left_shoulder = np.array([landmark_data['left_shoulder']['x'], landmark_data['left_shoulder']['y']])
        right_shoulder = np.array([landmark_data['right_shoulder']['x'], landmark_data['right_shoulder']['y']])
        left_hip = np.array([landmark_data['left_hip']['x'], landmark_data['left_hip']['y']])
        right_hip = np.array([landmark_data['right_hip']['x'], landmark_data['right_hip']['y']])
        nose = np.array([landmark_data['nose']['x'], landmark_data['nose']['y']])
        
        # Forward head detection (eyes if available)
        is_forward_head = False
        head_angle = 0
        if landmark_data['left_eye'] and landmark_data['right_eye']:
            left_eye = np.array([landmark_data['left_eye']['x'], landmark_data['left_eye']['y']])
            right_eye = np.array([landmark_data['right_eye']['x'], landmark_data['right_eye']['y']])
            eye_delta = right_eye - left_eye
            head_angle = degrees(atan2(eye_delta[1], eye_delta[0]))
            is_forward_head = abs(head_angle) > 5
        else:
            # Fallback: nose to shoulder distance
            shoulder_center = (left_shoulder + right_shoulder) / 2
            nose_to_shoulder = np.linalg.norm(nose - shoulder_center)
            shoulder_width = np.linalg.norm(left_shoulder - right_shoulder)
            head_forward_ratio = nose_to_shoulder / shoulder_width if shoulder_width > 0 else 0
            is_forward_head = head_forward_ratio > 0.25
        
        # Slouch detection (shoulder vs hip alignment)
        shoulder_delta = right_shoulder - left_shoulder
        hip_delta = right_hip - left_hip
        
        shoulder_norm = np.linalg.norm(shoulder_delta)
        hip_norm = np.linalg.norm(hip_delta)
        
        if shoulder_norm == 0 or hip_norm == 0:
            print("[UTILS] Invalid delta vectors (zero length)")
            if lang == 'hi':
                return {
                    'summary': 'पोज़ कैलकुलेशन में त्रुटि।',
                    'recommendations': ['साफ़ तस्वीर लें।'],
                    'notes': 'लैंडमार्क डेटा में समस्या।',
                    'score': 0,
                    'posture_type': 'calculation_error'
                }
            else:
                return {
                    'summary': 'Pose calculation error.',
                    'recommendations': ['Try a clearer photo.'],
                    'notes': 'Landmark data issue.',
                    'score': 0,
                    'posture_type': 'calculation_error'
                }
        
        shoulder_angle = degrees(atan2(shoulder_delta[1], shoulder_delta[0]))
        hip_angle = degrees(atan2(hip_delta[1], hip_delta[0]))
        slouch_diff = abs(shoulder_angle - hip_angle)
        is_slouch = slouch_diff > 10
        
        # Neck tension detection
        shoulder_center = (left_shoulder + right_shoulder) / 2
        neck_alignment = np.linalg.norm(nose - shoulder_center)
        avg_shoulder_dist = np.linalg.norm(left_shoulder - right_shoulder)
        neck_ratio = neck_alignment / avg_shoulder_dist if avg_shoulder_dist > 0 else 0
        is_tense_neck = neck_ratio > 0.3
        
        # Calculate overall score (0-100)
        base_score = 100
        slouch_penalty = min(30, slouch_diff * 2)
        head_penalty = min(20, abs(head_angle) * 2) if is_forward_head else 0
        neck_penalty = min(15, neck_ratio * 30) if is_tense_neck else 0
        final_score = max(0, int(base_score - slouch_penalty - head_penalty - neck_penalty))
        
        print(f"[UTILS] Analysis complete - slouch: {is_slouch}, head: {is_forward_head}, neck: {is_tense_neck}, score: {final_score}")
        
        # Generate bilingual recommendations
        if lang == 'hi':
            if is_slouch and is_forward_head and is_tense_neck:
                summary = 'झुकाव, सिर आगे, और गर्दन में तनाव।'
                recs = [
                    'सीधे बैठें और कंधे पीछे करें।',
                    'सिर को सीधा रखें, स्क्रीन आंखों के स्तर पर।',
                    'गर्दन को धीरे-धीरे स्ट्रेच करें।',
                    'हर 30 मिनट में ब्रेक लें।'
                ]
                notes = 'पूर्ण बॉडी तस्वीर और बेहतर लाइटिंग से सटीक विश्लेषण।'
                posture_type = 'needs_improvement'
            elif is_slouch:
                summary = 'हल्का झुकाव दिख रहा है।'
                recs = [
                    'पीठ सीधी रखें।',
                    'कंधे आराम से नीचे।',
                    'पैर फर्श पर समतल।',
                    'स्क्रीन को आंखों के स्तर पर रखें।'
                ]
                notes = 'सीधी मुद्रा बनाए रखें।'
                posture_type = 'mild_slouch'
            elif is_forward_head:
                summary = 'सिर थोड़ा आगे की ओर।'
                recs = [
                    'चिन को हल्का सा अंदर करें।',
                    'सिर को पीछे लाएं।',
                    'स्क्रीन को आंखों के स्तर पर रखें।',
                    'हर घंटे चिन टक एक्सरसाइज करें।'
                ]
                notes = 'स्क्रीन दूरी पर ध्यान दें।'
                posture_type = 'forward_head'
            elif is_tense_neck:
                summary = 'गर्दन में हल्का तनाव।'
                recs = [
                    'कंधे आराम से नीचे रखें।',
                    'गर्दन को धीरे-धीरे स्ट्रेच करें।',
                    'सिर को सीधा रखें।',
                    'गहरी सांस लें।'
                ]
                notes = 'गर्दन को आराम दें।'
                posture_type = 'neck_tension'
            else:
                summary = 'उत्तम मुद्रा! 👏'
                recs = [
                    'जारी रखें! 👍',
                    'हर 30 मिनट में ब्रेक लें।',
                    'पानी पीते रहें।',
                    'गहरी सांस लेते रहें।'
                ]
                notes = 'आपकी मुद्रा शानदार है। इसे बनाए रखें।'
                posture_type = 'excellent'
        else:
            if is_slouch and is_forward_head and is_tense_neck:
                summary = 'Slouch, forward head, and neck tension detected.'
                recs = [
                    'Sit up straight and roll shoulders back.',
                    'Keep head aligned with spine, screen at eye level.',
                    'Gently stretch your neck.',
                    'Take breaks every 30 minutes.'
                ]
                notes = 'Full body image and better lighting would improve analysis.'
                posture_type = 'needs_improvement'
            elif is_slouch:
                summary = 'Mild slouch detected.'
                recs = [
                    'Keep your back straight.',
                    'Relax shoulders down.',
                    'Feet flat on the floor.',
                    'Screen at eye level.'
                ]
                notes = 'Maintain good posture.'
                posture_type = 'mild_slouch'
            elif is_forward_head:
                summary = 'Slight forward head position.'
                recs = [
                    'Tuck chin slightly.',
                    'Pull head back.',
                    'Screen at eye level.',
                    'Do chin tucks every hour.'
                ]
                notes = 'Pay attention to screen distance.'
                posture_type = 'forward_head'
            elif is_tense_neck:
                summary = 'Mild neck tension detected.'
                recs = [
                    'Relax shoulders down.',
                    'Gently stretch neck.',
                    'Keep head aligned.',
                    'Take deep breaths.'
                ]
                notes = 'Give your neck a break.'
                posture_type = 'neck_tension'
            else:
                summary = 'Excellent posture! 👏'
                recs = [
                    'Keep it up! 👍',
                    'Take a break every 30 minutes.',
                    'Stay hydrated.',
                    'Keep breathing deeply.'
                ]
                notes = 'Your posture is fantastic. Keep maintaining it!'
                posture_type = 'excellent'
        
        # FIXED: Convert all numpy types to native Python types for JSON serialization
        result = {
            'summary': str(summary),
            'recommendations': [str(rec) for rec in recs],
            'notes': str(notes),
            'score': int(final_score),
            'posture_type': str(posture_type),
            'slouch_detected': bool(is_slouch),  # FIXED: numpy.bool_ to native bool
            'forward_head_detected': bool(is_forward_head),  # FIXED: numpy.bool_ to native bool
            'neck_tension_detected': bool(is_tense_neck),  # FIXED: numpy.bool_ to native bool
            'confidence': float(0.85),
            'analysis_timestamp': str(time.strftime('%Y-%m-%d %H:%M:%S')),
            'landmark_count': len(landmarks),
            'image_dimensions': {'width': int(width), 'height': int(height)}
        }
        
        print(f"[UTILS] Analysis complete: {posture_type} (score: {final_score})")
        return result
        
    except Exception as e:
        error_msg = f"Analysis failed: {str(e)}"
        print(f"[UTILS] ERROR: {error_msg}")
        print(f"[UTILS] Full traceback:")
        traceback.print_exc()
        
        # Return JSON-safe error response
        base_error = {
            'score': 0,
            'posture_type': 'error',
            'confidence': 0.0,
            'analysis_timestamp': str(time.strftime('%Y-%m-%d %H:%M:%S')),
            'slouch_detected': False,  # Native bool
            'forward_head_detected': False,  # Native bool
            'neck_tension_detected': False  # Native bool
        }
        
        if lang == 'hi':
            base_error.update({
                'summary': 'विश्लेषण विफल।',
                'recommendations': ['साफ़ तस्वीर लें।', 'अच्छी लाइटिंग का उपयोग करें।', 'फिर से कोशिश करें।'],
                'notes': f'त्रुटि: {str(e)}'
            })
        else:
            base_error.update({
                'summary': 'Analysis failed.',
                'recommendations': ['Try a clearer photo.', 'Use good lighting.', 'Please try again.'],
                'notes': f'Error: {str(e)}'
            })
        
        return base_error