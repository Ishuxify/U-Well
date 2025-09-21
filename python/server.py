"""
U-Well Posture Analysis Server
FastAPI server for posture detection using MediaPipe
Fixed version with parameter matching and safe imports
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import traceback
from typing import Optional
import time
import sys
import os

# Safe numpy import
try:
    import numpy as np
    NUMPY_AVAILABLE = True
    print("✅ NumPy imported successfully")
except ImportError as e:
    print(f"❌ NumPy import failed: {e}")
    np = None
    NUMPY_AVAILABLE = False

# Safe utils import
try:
    from utils import analyze_posture
    UTILS_AVAILABLE = True
    print("✅ Utils imported successfully")
except ImportError as e:
    print(f"❌ Utils import failed: {e}")
    analyze_posture = None
    UTILS_AVAILABLE = False

# Initialize FastAPI app
app = FastAPI(
    title="U-Well Posture Analysis API",
    description="API for analyzing posture from images using MediaPipe",
    version="1.0.0"
)

# CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8787", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global startup time
startup_time = time.time()

@app.get("/")
async def root():
    """Root endpoint - confirms server is running"""
    return {
        "message": "U-Well Posture Analysis API is running!",
        "status": "healthy",
        "port": 8000,
        "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
        "python_version": sys.version.split()[0],
        "endpoints": ["/", "/health", "/analyze_posture", "/test"],
        "utils_available": UTILS_AVAILABLE,
        "numpy_available": NUMPY_AVAILABLE,
        "current_dir": os.getcwd()
    }

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "ok",
        "service": "posture-analysis",
        "uptime": round(time.time() - startup_time, 1),
        "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
        "utils_status": "available" if UTILS_AVAILABLE else "missing",
        "numpy_status": "available" if NUMPY_AVAILABLE else "missing"
    }

@app.post("/analyze_posture")
async def analyze_posture_endpoint(
    image: UploadFile = File(None, description="Image file (JPG/PNG) for posture analysis"),  # FIXED: 'image' parameter
    lang: str = Form('en', description="Language: 'en' or 'hi'"),
    session_id: Optional[str] = Form(None, description="Session identifier")
):
    """
    Analyze uploaded image for posture and return personalized recommendations
    
    Expected request format:
    - image: image file (JPG/PNG)  # FIXED: matches client 'image' key
    - lang: 'en' or 'hi'
    - session_id: optional session identifier
    """
    try:
        # Validate language
        if lang not in ['en', 'hi']:
            lang = 'en'
        
        # Validate image file - FIXED parameter name
        if not image:
            error_response = {
                "type": "error",
                "error_code": "NO_IMAGE",
                "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
            }
            if lang == 'hi':
                error_response.update({
                    "summary": "कोई इमेज फाइल नहीं मिली",
                    "recommendations": ["कृपया JPG/PNG इमेज अपलोड करें"],
                    "notes": "इमेज फाइल आवश्यक है"
                })
            else:
                error_response.update({
                    "summary": "No image file provided",
                    "recommendations": ["Please upload a JPG/PNG image"],
                    "notes": "Image file is required"
                })
            return JSONResponse(status_code=400, content=error_response)
        
        # Validate file type - FIXED parameter
        allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/jpe']
        if image.content_type not in allowed_types:
            error_response = {
                "type": "error",
                "error_code": "INVALID_FILE_TYPE",
                "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
                "debug_info": {"received_type": image.content_type}
            }
            if lang == 'hi':
                error_response.update({
                    "summary": "गलत फाइल टाइप",
                    "recommendations": ["केवल JPG/PNG फाइलें स्वीकार्य हैं"],
                    "notes": f"प्राप्त फाइल: {image.content_type}"
                })
            else:
                error_response.update({
                    "summary": "Invalid file type",
                    "recommendations": ["Only JPG/PNG files are accepted"],
                    "notes": f"Received file: {image.content_type}"
                })
            return JSONResponse(status_code=400, content=error_response)
        
        # Read image file - FIXED parameter
        contents = await image.read()
        if len(contents) == 0:
            error_response = {
                "type": "error",
                "error_code": "EMPTY_FILE",
                "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
            }
            if lang == 'hi':
                error_response.update({
                    "summary": "खाली इमेज फाइल",
                    "recommendations": ["सही इमेज फाइल चुनें"],
                    "notes": "फाइल खाली है"
                })
            else:
                error_response.update({
                    "summary": "Empty image file",
                    "recommendations": ["Select a valid image file"],
                    "notes": "File is empty"
                })
            return JSONResponse(status_code=400, content=error_response)
        
        if len(contents) > 5 * 1024 * 1024:  # 5MB limit
            error_response = {
                "type": "error",
                "error_code": "FILE_TOO_LARGE",
                "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
                "debug_info": {"file_size": len(contents)}
            }
            if lang == 'hi':
                error_response.update({
                    "summary": "इमेज बहुत बड़ी है",
                    "recommendations": ["5MB से छोटी इमेज का उपयोग करें"],
                    "notes": f"फाइल साइज़: {len(contents)} bytes (अधिकतम 5MB)"
                })
            else:
                error_response.update({
                    "summary": "Image file too large",
                    "recommendations": ["Use image smaller than 5MB"],
                    "notes": f"File size: {len(contents)} bytes (max 5MB)"
                })
            return JSONResponse(status_code=400, content=error_response)
        
        print(f"[SERVER] Analyzing image: {image.filename}, lang: {lang}, size: {len(contents)} bytes")
        
        # Check if utils is available
        if not UTILS_AVAILABLE or analyze_posture is None:
            error_response = {
                "type": "error",
                "error_code": "UTILS_MISSING",
                "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
                "debug_info": {"utils_available": UTILS_AVAILABLE}
            }
            if lang == 'hi':
                error_response.update({
                    "summary": "विश्लेषण मॉड्यूल अनुपलब्ध",
                    "recommendations": ["सर्वर को रीस्टार्ट करें"],
                    "notes": "Utils module not found"
                })
            else:
                error_response.update({
                    "summary": "Analysis module unavailable",
                    "recommendations": ["Restart the server"],
                    "notes": "Utils module not found"
                })
            return JSONResponse(status_code=500, content=error_response)
        
        # Analyze posture using MediaPipe - FIXED parameter
        start_time = time.time()
        result = analyze_posture(contents, lang)
        processing_time = round(time.time() - start_time, 2)
        
        # Validate analysis result
        if not isinstance(result, dict) or 'summary' not in result:
            print(f"[SERVER] Invalid analysis result: {result}")
            if lang == 'hi':
                return {
                    "type": "error",
                    "summary": "विश्लेषण परिणाम अमान्य",
                    "recommendations": ["फिर से कोशिश करें"],
                    "notes": "Analysis function returned invalid data",
                    "error_code": "INVALID_ANALYSIS",
                    "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
                }
            else:
                return {
                    "type": "error",
                    "summary": "Invalid analysis result",
                    "recommendations": ["Please try again"],
                    "notes": "Analysis function returned invalid data",
                    "error_code": "INVALID_ANALYSIS",
                    "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
                }
        
        # Add metadata for tracking - FIXED parameter
        response = {
            **result,
            "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
            "session_id": session_id or image.filename or "anonymous",  # FIXED: image.filename
            "processing_time": processing_time,
            "api_version": "1.0.0",
            "image_info": {
                "filename": image.filename,  # FIXED: image.filename
                "size_bytes": len(contents),
                "content_type": image.content_type  # FIXED: image.content_type
            }
        }
        
        print(f"[SERVER] Analysis complete: {result.get('posture_type', 'unknown')}, score: {result.get('score', 'N/A')}, time: {processing_time}s")
        return response
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        # Log full error for debugging - FIXED parameter
        error_msg = f"POSTURE ANALYSIS ERROR: {str(e)}"
        print(error_msg)
        print(f"TRACEBACK: {traceback.format_exc()}")
        print(f"IMAGE INFO: filename={getattr(image, 'filename', 'None')}, content_type={getattr(image, 'content_type', 'None')}, size={len(contents) if 'contents' in locals() else 0}")
        
        # Language-specific error response
        error_detail = str(e)
        if lang == 'hi':
            summary = "विश्लेषण विफल - तकनीकी समस्या"
            recommendations = ["साफ़ तस्वीर लें", "अच्छी लाइटिंग का उपयोग करें", "फिर से कोशिश करें"]
            notes = f"त्रुटि: {error_detail}"
        else:
            summary = "Analysis failed - technical issue"
            recommendations = ["Try a clearer photo", "Use good lighting", "Please try again"]
            notes = f"Error: {error_detail}"
        
        return JSONResponse(
            status_code=500,
            content={
                "type": "error",
                "summary": summary,
                "recommendations": recommendations,
                "notes": notes,
                "error_code": "ANALYSIS_FAILED",
                "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
                "debug_info": {
                    "utils_available": UTILS_AVAILABLE,
                    "numpy_available": NUMPY_AVAILABLE,
                    "error_type": str(type(e).__name__),
                    "image_filename": getattr(image, 'filename', 'None'),
                    "image_size": len(contents) if 'contents' in locals() else 0,
                    "image_content_type": getattr(image, 'content_type', 'None')
                }
            }
        )

@app.get("/test")
async def test_endpoint():
    """Test endpoint to verify dependencies with safe imports"""
    result = {
        "message": "Test endpoint working!",
        "endpoints": ["/", "/health", "/analyze_posture", "/test"],
        "python_version": sys.version.split()[0],
        "current_dir": os.getcwd(),
        "utils_available": UTILS_AVAILABLE
    }
    
    deps = {}
    
    # Test numpy with safe import
    try:
        import numpy as np_local
        deps["numpy"] = f"v{np_local.__version__}"
        print("✅ NumPy imported successfully")
    except ImportError as e:
        deps["numpy"] = f"FAILED: {str(e)}"
        print(f"❌ NumPy import failed: {e}")
    
    # Test opencv
    try:
        import cv2
        deps["opencv"] = f"v{cv2.__version__}"
        print("✅ OpenCV imported successfully")
    except ImportError as e:
        deps["opencv"] = f"FAILED: {str(e)}"
        print(f"❌ OpenCV import failed: {e}")
    
    # Test mediapipe
    try:
        import mediapipe as mp
        deps["mediapipe"] = f"v{mp.__version__}"
        print("✅ MediaPipe imported successfully")
    except ImportError as e:
        deps["mediapipe"] = f"FAILED: {str(e)}"
        print(f"❌ MediaPipe import failed: {e}")
    
    # Test PIL/Pillow
    try:
        from PIL import Image
        deps["pillow"] = f"v{Image.__version__}"
        print("✅ Pillow imported successfully")
    except ImportError as e:
        deps["pillow"] = f"FAILED: {str(e)}"
        print(f"❌ Pillow import failed: {e}")
    
    # Test utils function
    if UTILS_AVAILABLE and analyze_posture:
        try:
            # Test with dummy data
            test_result = analyze_posture(b"dummy_image_bytes", lang='en')
            deps["utils_function"] = f"OK - returned {len(test_result)} keys: {list(test_result.keys())}"
            print("✅ Utils function working")
        except Exception as e:
            deps["utils_function"] = f"FAILED: {str(e)}"
            print(f"❌ Utils function error: {e}")
    else:
        deps["utils_function"] = "NOT_AVAILABLE - utils.py missing or import failed"
    
    result["dependencies"] = deps
    return result

if __name__ == "__main__":
    print("🚀 Starting U-Well Posture Analysis Server...")
    print("📱 Listening on http://0.0.0.0:8000")
    print("🔄 Auto-reload enabled (development mode)")
    print("📸 Ready for posture analysis requests!")
    print(f"Utils available: {UTILS_AVAILABLE}")
    print(f"NumPy available: {NUMPY_AVAILABLE}")
    
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
        access_log=True,
        workers=1
    )