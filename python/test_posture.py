import requests
import os
import json
from io import BytesIO

def test_posture_analysis_fixed():
    # Your exact image path
    image_path = r"C:\Users\ACEPC\Downloads\breathing-exercise.jpg"
    
    # Verify file exists
    if not os.path.exists(image_path):
        print(f"❌ Image not found: {image_path}")
        print("\n🔍 Checking Downloads folder...")
        downloads_dir = r"C:\Users\ACEPC\Downloads"
        if os.path.exists(downloads_dir):
            for file in os.listdir(downloads_dir):
                if 'breathing' in file.lower() and file.lower().endswith(('.jpg', '.jpeg', '.png')):
                    full_path = os.path.join(downloads_dir, file)
                    size = os.path.getsize(full_path)
                    print(f"  ✅ Found: {file} ({size:,} bytes)")
                    image_path = full_path  # Use this file
                    break
        else:
            print("❌ Downloads folder not found")
            return
    else:
        print(f"✅ Image found: {image_path}")
    
    # Get file info
    filename = os.path.basename(image_path)
    file_size = os.path.getsize(image_path)
    _, ext = os.path.splitext(image_path)
    content_type = "image/jpeg" if ext.lower() in ['.jpg', '.jpeg'] else "image/png"
    
    print(f"📄 Filename: {filename}")
    print(f"📏 Size: {file_size:,} bytes")
    print(f"📋 Extension: {ext}")
    print(f"📄 Content-Type: {content_type}")
    
    # Read image as BYTES (not file object)
    try:
        with open(image_path, 'rb') as f:
            image_bytes = f.read()  # Read complete bytes
        print(f"✅ Image read successfully: {len(image_bytes):,} bytes")
    except Exception as e:
        print(f"❌ Failed to read image: {e}")
        return
    
    # Test Python server
    url = "http://localhost:8000/analyze_posture"
    
    try:
        print("\n🚀 Sending FIXED multipart form (bytes) to Python server...")
        
        # Create BytesIO object for proper multipart
        image_stream = BytesIO(image_bytes)
        
        # Create files dict with proper tuple format
        files = {
            'image': (filename, image_stream, content_type)
        }
        data = {
            'lang': 'en',
            'session_id': 'breathing_test_fixed'
        }
        
        print(f"📤 Uploading: {filename} ({len(image_bytes):,} bytes)")
        print(f"📤 Form: lang=en, session_id=breathing_test_fixed")
        print(f"📤 Files: {list(files.keys())}")
        
        # Send request with stream position reset
        image_stream.seek(0)  # Reset stream position to beginning
        
        response = requests.post(url, files=files, data=data, timeout=30)
        
        print(f"\n✅ HTTP Status: {response.status_code}")
        print(f"📊 Response Time: {response.elapsed.total_seconds():.2f}s")
        print(f"📈 Content Length: {len(response.content)} bytes")
        print(f"📋 Content-Type: {response.headers.get('content-type', 'N/A')}")
        
        if response.status_code == 200:
            try:
                result = response.json()
                print("\n🎉 BREATHING EXERCISE IMAGE ANALYSIS SUCCESS!")
                print(f"📊 Summary: {result.get('summary', 'N/A')}")
                print(f"⭐ Score: {result.get('score', 'N/A')}")
                print(f"📝 Posture Type: {result.get('posture_type', 'N/A')}")
                print(f"💡 Recommendations: {len(result.get('recommendations', []))} items")
                print(f"📈 Slouch: {result.get('slouch_detected', 'N/A')}")
                print(f"👤 Forward Head: {result.get('forward_head_detected', 'N/A')}")
                print(f"🧍 Neck Tension: {result.get('neck_tension_detected', 'N/A')}")
                print(f"🎯 Confidence: {result.get('confidence', 'N/A')}")
                
                print(f"\n📋 Complete Analysis:")
                print(json.dumps(result, indent=2, ensure_ascii=False))
                
                # Save result
                output_file = f'analysis_{filename.replace(".", "_")}.json'
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(result, f, indent=2, ensure_ascii=False)
                print(f"\n💾 Saved to: {output_file}")
                
                return result
                
            except json.JSONDecodeError as e:
                print(f"❌ JSON Parse Error: {e}")
                print(f"📄 Raw Response: {response.text[:500]}...")
                return None
        elif response.status_code == 422:
            print(f"❌ Validation Error 422")
            print(f"📄 Error Details: {response.text}")
            print(f"🔍 Headers: {dict(response.headers)}")
            return None
        else:
            print(f"❌ HTTP Error {response.status_code}")
            print(f"📄 Response: {response.text}")
            print(f"🔍 Headers: {dict(response.headers)}")
            return None
            
    except requests.exceptions.ConnectionError as e:
        print("❌ Cannot connect to Python server")
        print("🔍 Troubleshooting:")
        print("  1. Is Python server running? Check uvicorn terminal")
        print("  2. Run: cd C:\\Users\\ACEPC\\Desktop\\U well\\python")
        print("  3. Then: uvicorn server:app --reload --host 0.0.0.0 --port 8000")
        print(f"  4. Connection error: {e}")
        return None
    except FileNotFoundError as e:
        print(f"❌ File error: {e}")
        return None
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return None

def test_hindi_version():
    """Test Hindi analysis"""
    image_path = r"C:\Users\ACEPC\Downloads\breathing-exercise.jpg"
    
    if not os.path.exists(image_path):
        print(f"❌ Hindi test: Image not found")
        return
    
    print("\n" + "="*60)
    print("🗣️ TESTING HINDI ANALYSIS...")
    
    try:
        with open(image_path, 'rb') as f:
            image_bytes = f.read()
        
        image_stream = BytesIO(image_bytes)
        filename = os.path.basename(image_path)
        _, ext = os.path.splitext(image_path)
        content_type = "image/jpeg" if ext.lower() in ['.jpg', '.jpeg'] else "image/png"
        
        files = {'image': (filename, image_stream, content_type)}
        data = {'lang': 'hi', 'session_id': 'hindi_test_001'}
        
        image_stream.seek(0)
        response = requests.post("http://localhost:8000/analyze_posture", files=files, data=data, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Hindi Status: {response.status_code}")
            print(f"📊 Hindi Summary: {result.get('summary', 'N/A')}")
            print(f"⭐ Hindi Score: {result.get('score', 'N/A')}")
            print(f"💡 Hindi Recs: {len(result.get('recommendations', []))} items")
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            print(f"❌ Hindi Error {response.status_code}: {response.text}")
            
    except Exception as e:
        print(f"❌ Hindi test error: {e}")

def test_node_integration():
    """Test through Node server"""
    print("\n" + "="*60)
    print("🔗 TESTING NODE SERVER INTEGRATION...")
    
    image_path = r"C:\Users\ACEPC\Downloads\breathing-exercise.jpg"
    
    if not os.path.exists(image_path):
        print("❌ Node test: Image not found")
        return
    
    try:
        with open(image_path, 'rb') as f:
            image_bytes = f.read()
        
        image_stream = BytesIO(image_bytes)
        filename = os.path.basename(image_path)
        _, ext = os.path.splitext(image_path)
        content_type = "image/jpeg" if ext.lower() in ['.jpg', '.jpeg'] else "image/png"
        
        files = {'image': (filename, image_stream, content_type)}
        data = {'lang': 'en', 'sessionId': 'node_test_001'}
        
        image_stream.seek(0)
        node_url = "http://localhost:8787/api/analyze"
        response = requests.post(node_url, files=files, data=data, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Node Status: {response.status_code}")
            print(f"🔄 Node Type: {result.get('type', 'N/A')}")
            print(f"📊 Node Summary: {result.get('summary', 'N/A')}")
            print(f"⭐ Node Score: {result.get('score', 'N/A')}")
            print(f"💡 Node Recs: {len(result.get('recommendations', []))} items")
            print(json.dumps(result, indent=2))
        else:
            print(f"❌ Node Error {response.status_code}: {response.text}")
            
    except Exception as e:
        print(f"❌ Node test error: {e}")

if __name__ == "__main__":
    print("🧪 U-Well Posture Analysis Test Suite")
    print("="*50)
    
    # Main English test
    result = test_posture_analysis_fixed()
    
    if result and result.get('type') != 'error':
        # Test Hindi if main test passed
        test_hindi_version()
        
        # Test Node integration
        test_node_integration()
    else:
        print("\n❌ Main test failed - skipping additional tests")
        print("\n🔍 Troubleshooting:")
        print("  1. Check if image file exists and is valid JPG/PNG")
        print("  2. Verify Python server is running (uvicorn output)")
        print("  3. Check server logs for [SERVER] POSTURE ANALYSIS ERROR")