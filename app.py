from flask import Flask, request, jsonify, render_template, session, redirect, url_for, Response
import os
import re
import requests
import tensorflow as tf
import numpy as np
from PIL import Image
import io
import json
from datetime import timedelta
from dotenv import load_dotenv
import google.generativeai as genai
from bson import ObjectId
from bson.errors import InvalidId
from pymongo import DESCENDING
from pymongo.errors import DuplicateKeyError
from werkzeug.security import generate_password_hash, check_password_hash
from utils.disease_info import disease_remedies, disease_fertilizers
from utils.db import get_db, now_utc, DatabaseNotConfigured, HISTORY_TTL_DAYS
from utils.auth import login_required, current_user_id, save_history, HISTORY_TYPES
from utils.tts import clean_for_speech, synthesize, MAX_TTS_CHARS
from utils.plans import extract_tasks, plan_view, parse_date, today_ist, MAX_ACTIVE_PLANS
from utils.schemes import CENTRAL_SCHEMES, SCHEME_NEEDS

# How many previous chat messages (user + assistant) are sent to Gemini as context
CHAT_MEMORY_MESSAGES = 10

# Load environment variables
load_dotenv()

# Configure Gemini
try:
    genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))
    gemini_model = genai.GenerativeModel('gemini-2.5-flash')
except Exception as e:
    print(f"Error configuring Gemini: {e}")
    gemini_model = None

RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "")
RAPIDAPI_HOST = os.environ.get("RAPIDAPI_HOST", "weatherapi-com.p.rapidapi.com")

app = Flask(__name__)

SECRET_KEY = os.environ.get("SECRET_KEY", "")
if not SECRET_KEY:
    print("WARNING: SECRET_KEY not set in .env — using a random key, users will be logged out on every restart.")
    SECRET_KEY = os.urandom(32).hex()
app.config.update(
    SECRET_KEY=SECRET_KEY,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    # Set SESSION_COOKIE_SECURE=1 in production (HTTPS) so the login cookie is never sent over plain HTTP
    SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
)

# Constants
CLASS_NAMES = [
    'Apple___Apple_scab', 'Apple___Black_rot', 'Apple___Cedar_apple_rust', 'Apple___healthy',
    'Blueberry___healthy', 'Cherry_(including_sour)___Powdery_mildew', 
    'Cherry_(including_sour)___healthy', 'Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot', 
    'Corn_(maize)___Common_rust_', 'Corn_(maize)___Northern_Leaf_Blight', 'Corn_(maize)___healthy', 
    'Grape___Black_rot', 'Grape___Esca_(Black_Measles)', 'Grape___Leaf_blight_(Isariopsis_Leaf_Spot)', 
    'Grape___healthy', 'Orange___Haunglongbing_(Citrus_greening)', 'Peach___Bacterial_spot',
    'Peach___healthy', 'Pepper,_bell___Bacterial_spot', 'Pepper,_bell___healthy', 
    'Potato___Early_blight', 'Potato___Late_blight', 'Potato___healthy', 
    'Raspberry___healthy', 'Soybean___healthy', 'Squash___Powdery_mildew', 
    'Strawberry___Leaf_scorch', 'Strawberry___healthy', 'Tomato___Bacterial_spot', 
    'Tomato___Early_blight', 'Tomato___Late_blight', 'Tomato___Leaf_Mold', 
    'Tomato___Septoria_leaf_spot', 'Tomato___Spider_mites Two-spotted_spider_mite', 
    'Tomato___Target_Spot', 'Tomato___Tomato_Yellow_Leaf_Curl_Virus', 'Tomato___Tomato_mosaic_virus',
    'Tomato___healthy'
]

# Load model globally
print("Loading model...")
try:
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    MODEL_PATH = os.path.join(BASE_DIR, "trained_plant_disease_model_fixed.keras")
    model = tf.keras.models.load_model(MODEL_PATH, compile=False)
    print("Model loaded successfully from:", MODEL_PATH)
except Exception as e:
    print(f"Error loading model: {e}")
    model = None

@app.errorhandler(DatabaseNotConfigured)
def handle_db_not_configured(e):
    return jsonify({"error": str(e)}), 503

@app.route('/')
@login_required
def home():
    return render_template('index.html', user_name=session.get('user_name', ''))

@app.route('/login')
def login_page():
    if current_user_id():
        return redirect(url_for('home'))
    return render_template('login.html')

@app.route('/ping')
def ping():
    return 'pong'

# --- Authentication ---

def normalize_phone(raw):
    """Return a 10-digit Indian mobile number, or None if invalid. Accepts +91 / spaces / dashes."""
    digits = re.sub(r'\D', '', raw or '')
    if len(digits) == 12 and digits.startswith('91'):
        digits = digits[2:]
    return digits if len(digits) == 10 else None

def start_session(user):
    session.clear()
    session.permanent = True
    session['user_id'] = str(user['_id'])
    session['user_name'] = user['name']

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    phone = normalize_phone(data.get('phone'))
    password = data.get('password') or ''

    if not name:
        return jsonify({"error": "Please enter your name."}), 400
    if not phone:
        return jsonify({"error": "Please enter a valid 10-digit mobile number."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    user = {
        "name": name,
        "phone": phone,
        "password_hash": generate_password_hash(password),
        "created_at": now_utc(),
    }
    try:
        user['_id'] = get_db().users.insert_one(user).inserted_id
    except DuplicateKeyError:
        return jsonify({"error": "An account with this mobile number already exists. Please log in."}), 409

    start_session(user)
    return jsonify({"success": True, "name": name})

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json or {}
    phone = normalize_phone(data.get('phone'))
    password = data.get('password') or ''

    user = get_db().users.find_one({"phone": phone}) if phone else None
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({"error": "Incorrect mobile number or password."}), 401

    start_session(user)
    return jsonify({"success": True, "name": user['name']})

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"success": True})

# --- History (auto-deleted by MongoDB TTL index after HISTORY_TTL_DAYS) ---

def serialize_history(doc, include_output=False):
    item = {
        "id": str(doc['_id']),
        "type": doc['type'],
        "title": doc['title'],
        "inputs": doc.get('inputs', {}),
        "created_at": doc['created_at'].isoformat(),
        "expires_at": (doc['created_at'] + timedelta(days=HISTORY_TTL_DAYS)).isoformat(),
    }
    if include_output:
        item['output'] = doc.get('output')
    return item

def find_own_history(history_id):
    try:
        oid = ObjectId(history_id)
    except (InvalidId, TypeError):
        return None
    return get_db().history.find_one({"_id": oid, "user_id": current_user_id()})

@app.route('/api/history', methods=['GET'])
@login_required
def list_history():
    query = {"user_id": current_user_id()}
    entry_type = request.args.get('type')
    if entry_type in HISTORY_TYPES:
        query['type'] = entry_type
    docs = get_db().history.find(query, {"output": 0}).sort("created_at", DESCENDING).limit(200)
    return jsonify({"success": True, "retention_days": HISTORY_TTL_DAYS, "items": [serialize_history(d) for d in docs]})

@app.route('/api/history/<history_id>', methods=['GET'])
@login_required
def get_history(history_id):
    doc = find_own_history(history_id)
    if not doc:
        return jsonify({"error": "History item not found."}), 404
    return jsonify({"success": True, "item": serialize_history(doc, include_output=True)})

@app.route('/api/history/<history_id>', methods=['DELETE'])
@login_required
def delete_history(history_id):
    doc = find_own_history(history_id)
    if not doc:
        return jsonify({"error": "History item not found."}), 404
    get_db().history.delete_one({"_id": doc['_id']})
    return jsonify({"success": True})

@app.route('/api/predict', methods=['POST'])
@login_required
def predict():
    if model is None:
        return jsonify({"error": "Model not loaded on server."}), 500

    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
        
    file = request.files['image']
    language = request.form.get('language', 'en')
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        # Read the image
        img_bytes = file.read()
        img = Image.open(io.BytesIO(img_bytes))
        
        # Preprocess the image
        img = img.resize((128, 128))
        input_arr = tf.keras.preprocessing.image.img_to_array(img)
        input_arr = np.array([input_arr])  # Convert single image to a batch
        
        # Predict
        predictions = model.predict(input_arr)
        result_index = np.argmax(predictions)
        predicted_class = CLASS_NAMES[result_index]
        
        # Get remedies and fertilizers
        remedies = disease_remedies.get(predicted_class, ["No specific remedies found."])
        fertilizers = disease_fertilizers.get(predicted_class, ["No specific fertilizers found."])
        
        # Format the name nicely
        formatted_name = predicted_class.replace('___', ' - ').replace('_', ' ')
        is_healthy = "healthy" in predicted_class.lower()
        
        translated_prediction = None
        if language != 'en' and gemini_model:
            try:
                trans_prompt = f"Translate the following plant disease name, remedies list, and fertilizers list into language code '{language}'. Return ONLY a valid JSON object with keys: 'predicted_class', 'remedies' (list of strings), 'fertilizers' (list of strings).\n\nName: {formatted_name}\nRemedies: {remedies}\nFertilizers: {fertilizers}"
                trans_resp = gemini_model.generate_content(trans_prompt)
                trans_text = trans_resp.text.strip()
                if trans_text.startswith('```json'): trans_text = trans_text[7:-3]
                if trans_text.endswith('```'): trans_text = trans_text[:-3]
                trans_dict = json.loads(trans_text.strip())
                
                translated_prediction = trans_dict.get('predicted_class', formatted_name)
                remedies = trans_dict.get('remedies', remedies)
                fertilizers = trans_dict.get('fertilizers', fertilizers)
            except Exception as e:
                print("Translation fallback failed:", e)

        result = {
            "success": True,
            "prediction": formatted_name,
            "translated_prediction": translated_prediction,
            "is_healthy": is_healthy,
            "remedies": remedies,
            "fertilizers": fertilizers
        }
        save_history("disease", translated_prediction or formatted_name,
                     {"filename": file.filename, "language": language}, result)
        return jsonify(result)
        
    except Exception as e:
        print(f"Error during prediction: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat', methods=['POST'])
@login_required
def chat():
    if not gemini_model:
        return jsonify({"error": "AI model not configured. Please check your GEMINI_API_KEY in .env"}), 500
        
    # Handle both JSON and form data (for image uploads)
    if request.is_json:
        user_message = request.json.get('message', '')
        language = request.json.get('language', 'en')
        chat_history = request.json.get('history', [])
        img_file = None
    else:
        user_message = request.form.get('message', '')
        language = request.form.get('language', 'en')
        try:
            chat_history = json.loads(request.form.get('history', '[]'))
        except ValueError:
            chat_history = []
        img_file = request.files.get('image')

    if not user_message and not img_file:
        return jsonify({"error": "No message or image provided"}), 400

    try:
        # Earlier messages of this chat session, so follow-up questions have context
        conversation = ""
        if isinstance(chat_history, list):
            lines = []
            for msg in chat_history[-CHAT_MEMORY_MESSAGES:]:
                if isinstance(msg, dict) and msg.get('text'):
                    speaker = "Farmer" if msg.get('role') == 'user' else "Kissan Sarthi AI"
                    lines.append(f"{speaker}: {str(msg['text'])[:1500]}")
            if lines:
                conversation = "Conversation so far (use it to understand follow-up questions):\n" + "\n".join(lines)

        # Provide context to the AI
        prompt = f"""You are Kissan Sarthi AI, an expert agricultural advisor and farming assistant.
        Your goal is to help farmers with crop management, disease prevention, and general farming practices.
        Keep your answers concise, practical, and highly relevant to farming.

        CRITICAL: You MUST answer entirely in the language corresponding to language code '{language}'.

        {conversation}

        User's question: {user_message}"""
        
        content_to_send = [prompt]
        
        if img_file and img_file.filename != '':
            img_bytes = img_file.read()
            img = Image.open(io.BytesIO(img_bytes))
            content_to_send.append(img)
        
        response = gemini_model.generate_content(content_to_send)
        has_image = bool(img_file and img_file.filename)
        save_history("chat", (user_message or "Image question")[:80],
                     {"message": user_message, "has_image": has_image, "language": language},
                     {"reply": response.text})
        return jsonify({"success": True, "reply": response.text})
    except Exception as e:
        print(f"Chat error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/weather', methods=['POST'])
@login_required
def weather_advisory():
    if not RAPIDAPI_KEY:
        return jsonify({"error": "Weather API key not configured. Please check your RAPIDAPI_KEY in .env"}), 500
    if not gemini_model:
        return jsonify({"error": "AI model not configured for advisory. Please check your GEMINI_API_KEY in .env"}), 500
        
    data = request.json
    if not data or 'location' not in data:
        return jsonify({"error": "No location provided"}), 400
        
    location = data['location']
    language = data.get('language', 'en')
    
    try:
        # 1. Fetch weather from RapidAPI (Requesting up to 15 days)
        weather_url = f"https://{RAPIDAPI_HOST}/forecast.json?q={location}&days=15"
        headers = {
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": RAPIDAPI_HOST
        }
        weather_res = requests.get(weather_url, headers=headers)
        weather_data = weather_res.json()
        
        if weather_res.status_code != 200:
            return jsonify({"error": weather_data.get("error", {}).get("message", "Failed to fetch weather")}), 400
            
        current = weather_data.get('current', {})
        temp = current.get('temp_c', 'N/A')
        humidity = current.get('humidity', 'N/A')
        description = current.get('condition', {}).get('text', 'N/A')
        
        # Parse Forecast Data
        forecast_days = weather_data.get('forecast', {}).get('forecastday', [])
        parsed_forecast = []
        forecast_summary = []
        
        for day in forecast_days:
            date = day.get('date')
            day_data = day.get('day', {})
            max_t = day_data.get('maxtemp_c')
            min_t = day_data.get('mintemp_c')
            cond = day_data.get('condition', {}).get('text')
            icon = day_data.get('condition', {}).get('icon')
            
            parsed_forecast.append({
                "date": date,
                "max_temp": max_t,
                "min_temp": min_t,
                "condition": cond,
                "icon": icon
            })
            forecast_summary.append(f"{date}: {cond}, {min_t}-{max_t}°C")
            
        forecast_text = "\n".join(forecast_summary)
        
        # 2. Get AI Advisory based on weather
        prompt = f"""You are an expert agricultural advisor. 
        The current weather in {location} is {temp}°C with {humidity}% humidity and {description}.
        
        Here is the forecast for the upcoming days:
        {forecast_text}
        
        Based on this weather outlook, please provide a concise agricultural advisory (under 200 words) structured exactly with these three headings:
        
        ### 1. Recommended Actions

        (Provide 2-3 immediate, actionable steps farmers should take right now based on the current weather and upcoming forecast.)
        
        ### 2. Precautions for Current Crops
        (Identify any risks such as frost, heat stress, drought, or fungal/pest outbreaks due to the forecasted humidity and temperature. Detail what precautions to take for already sown crops.)
        
        ### 3. Sowing Recommendations
        (Suggest specific crops, vegetables, or plants that are ideal to sow or prepare for during this weather window in this region. If the weather is highly unfavorable for sowing, explicitly advise them to wait and explain why.)
        
        CRITICAL: You MUST write your entire advisory in the language corresponding to language code '{language}'.
        """
        
        advisory_response = gemini_model.generate_content(prompt)

        result = {
            "success": True,
            "weather": {
                "temp": temp,
                "humidity": humidity,
                "description": description.capitalize() if isinstance(description, str) else description
            },
            "forecast": parsed_forecast,
            "advisory": advisory_response.text
        }
        save_history("weather", f"Weather advisory: {location}", {"location": location, "language": language}, result)
        return jsonify(result)
    except Exception as e:
        print(f"Weather advisory error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/guidebook', methods=['POST'])
@login_required
def guidebook():
    if not gemini_model:
        return jsonify({"error": "AI model not configured. Please check your GEMINI_API_KEY in .env"}), 500
        
    data = request.json
    if not data or 'crop' not in data or 'soil' not in data:
        return jsonify({"error": "Crop and Soil Type are required"}), 400
        
    crop = data['crop']
    soil = data['soil']
    language = data.get('language', 'en')
    
    try:
        prompt = f"""You are a master agronomist. The user wants to grow '{crop}' in '{soil}' soil. 
        Generate a "Crop Farming Guidebook" that is approximately 3 to 4 pages long.
        Use Markdown formatting (Headers like #, ##, tables, bold text, bullet points).
        Keep your descriptions concise, clear, and to the point to avoid making the document too long.
        
        CRITICAL: The ENTIRE guidebook must be written in {language}.
        
        Must include the following sections:
        # {crop.title()} Cultivation Guide
        
        ## 1. Soil Preparation & Sowing
        (Briefly explain soil treatment, plowing, depth, and spacing).
        
        ## 2. Recommended Fertilizers & Nutrition
        (List exact organic and chemical fertilizer names, NPK ratios, and a timeline of when to apply them).
        
        ## 3. Growth Schedule
        (Create a Markdown Table showing a timeline from Day 1 to Harvest).
        
        ## 4. Pest & Disease Management
        (Detail 2-3 common diseases/pests and their remedies).
        
        ## 5. Harvesting & Storage
        (Steps to harvest and post-harvest storage).
        
        ## 6. Executive Summary
        (A final 1-page summary stating the key points, total estimated duration from sowing to harvest, and the absolute best methods for success).
        """
        
        guide_response = gemini_model.generate_content(prompt)
        history_id = save_history("guidebook", f"{crop.title()} guidebook ({soil} soil)",
                                  {"crop": crop, "soil": soil, "language": language}, {"guide": guide_response.text})

        return jsonify({
            "success": True, 
            "guide": guide_response.text,
            "history_id": history_id
        })
    except Exception as e:
        print(f"Guidebook error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/economics', methods=['POST'])
@login_required
def economics():
    if not gemini_model:
        return jsonify({"error": "AI model not configured. Please check your GEMINI_API_KEY in .env"}), 500
        
    data = request.json
    if not data or 'crop' not in data or 'land_size' not in data or 'unit' not in data:
        return jsonify({"error": "Crop, Land Size, and Unit are required"}), 400
        
    crop = data['crop']
    land_size = data['land_size']
    unit = data['unit']
    language = data.get('language', 'en')
    
    try:
        prompt = f"""You are an expert Indian agricultural economist. The farmer is planning to grow '{crop}' on exactly '{land_size} {unit}' of land in India.
        Generate a CONCISE, SINGLE-PAGE financial calculation report. 
        CRITICAL: All calculations MUST be in Indian Rupees (INR / ₹) and based on current estimated Indian market prices.
        Use Markdown formatting (Headers like #, ##, Markdown Tables). Keep descriptions extremely brief so the entire output fits on one printed page.
        
        Must include the following exact sections:
        # Financial Projection: {crop.title()} ({land_size} {unit})
        
        ## 1. Market Price (India)
        (State the estimated current selling price per Quintal, Ton, or Kg in ₹).
        
        ## 2. Estimated Costs Breakdown (₹)
        (Create a single concise Markdown Table. Columns: 'Expense Category', 'Estimated Cost (₹)').
        Categories: Seeds, Fertilizers/Pesticides, Labor, Water/Irrigation, Miscellaneous, Total Cost.
        
        ## 3. Revenue & Profit Projection (₹)
        (Create a single concise Markdown Table.
        Rows: 'Estimated Total Yield', 'Expected Gross Revenue (₹)', 'Total Estimated Costs (₹)', 'Projected Net Profit (₹)').
        
        CRITICAL: You MUST write the entire report (including all headings, content, and the table) in the language corresponding to language code '{language}', but keep the currency symbol as ₹.
        """
        
        report_response = gemini_model.generate_content(prompt)
        save_history("economics", f"{crop.title()} economics ({land_size} {unit})",
                     {"crop": crop, "land_size": land_size, "unit": unit, "language": language},
                     {"report": report_response.text})

        return jsonify({
            "success": True, 
            "report": report_response.text
        })
    except Exception as e:
        print(f"Economics error: {e}")
        return jsonify({"error": str(e)}), 500

# --- Voice replies (free Google TTS via gTTS) ---

@app.route('/api/tts', methods=['POST'])
@login_required
def tts():
    data = request.json or {}
    text = clean_for_speech(data.get('text') or '')[:MAX_TTS_CHARS]
    if not text:
        return jsonify({"error": "Nothing to read aloud."}), 400
    try:
        audio = synthesize(text, data.get('language', 'en'))
    except Exception as e:
        print(f"TTS error: {e}")
        return jsonify({"error": "Voice service is unavailable right now. Please try again."}), 502
    return Response(audio, mimetype='audio/mpeg')

# --- Followed crop plans (from a guidebook) shown on the home dashboard ---

def find_own_plan(plan_id):
    try:
        oid = ObjectId(plan_id)
    except (InvalidId, TypeError):
        return None
    return get_db().plans.find_one({"_id": oid, "user_id": current_user_id()})

@app.route('/api/plans', methods=['GET'])
@login_required
def list_plans():
    plans = get_db().plans.find({"user_id": current_user_id()}, {"guide": 0}).sort("created_at", DESCENDING)
    return jsonify({"success": True, "today": today_ist().isoformat(), "plans": [plan_view(p) for p in plans]})

@app.route('/api/plans', methods=['POST'])
@login_required
def follow_plan():
    if not gemini_model:
        return jsonify({"error": "AI model not configured. Please check your GEMINI_API_KEY in .env"}), 500

    data = request.json or {}
    start = parse_date(data['start_date']) if data.get('start_date') else today_ist()
    if not start:
        return jsonify({"error": "Please enter the sowing date as YYYY-MM-DD."}), 400
    guide_doc = find_own_history(data.get('history_id'))
    if not guide_doc or guide_doc['type'] != 'guidebook':
        return jsonify({"error": "Guidebook not found. Please generate it again."}), 404

    db = get_db()
    if db.plans.find_one({"user_id": current_user_id(), "source_history_id": str(guide_doc['_id'])}):
        return jsonify({"error": "You are already following this guidebook."}), 409
    if db.plans.count_documents({"user_id": current_user_id()}) >= MAX_ACTIVE_PLANS:
        return jsonify({"error": f"You can follow up to {MAX_ACTIVE_PLANS} crop plans. Remove one first."}), 400

    inputs = guide_doc.get('inputs', {})
    guide = guide_doc.get('output', {}).get('guide', '')
    try:
        tasks = extract_tasks(gemini_model, guide, inputs.get('language', 'en'))
    except Exception as e:
        print(f"Plan extraction error: {e}")
        return jsonify({"error": "Could not create a schedule from this guidebook. Please try again."}), 502
    if not tasks:
        return jsonify({"error": "Could not create a schedule from this guidebook. Please try again."}), 502

    plan = {
        "user_id": current_user_id(),
        "source_history_id": str(guide_doc['_id']),
        "crop": inputs.get('crop', 'Crop').title(),
        "soil": inputs.get('soil', ''),
        "language": inputs.get('language', 'en'),
        "guide": guide,
        "tasks": tasks,
        "done": [],
        "start_date": start.isoformat(),
        "created_at": now_utc(),
    }
    try:
        plan['_id'] = db.plans.insert_one(plan).inserted_id
    except DuplicateKeyError:
        return jsonify({"error": "You are already following this guidebook."}), 409
    return jsonify({"success": True, "plan": plan_view(plan)})

@app.route('/api/plans/<plan_id>', methods=['PATCH'])
@login_required
def update_plan(plan_id):
    plan = find_own_plan(plan_id)
    if not plan:
        return jsonify({"error": "Plan not found."}), 404
    start = parse_date((request.json or {}).get('start_date'))
    if not start:
        return jsonify({"error": "Please choose a valid sowing date."}), 400
    get_db().plans.update_one({"_id": plan['_id']}, {"$set": {"start_date": start.isoformat()}})
    plan['start_date'] = start.isoformat()
    return jsonify({"success": True, "plan": plan_view(plan)})

@app.route('/api/plans/<plan_id>/tasks/<int:index>', methods=['PATCH'])
@login_required
def update_plan_task(plan_id, index):
    plan = find_own_plan(plan_id)
    if not plan or not 0 <= index < len(plan['tasks']):
        return jsonify({"error": "Task not found."}), 404
    done = bool((request.json or {}).get('done'))
    op = {"$addToSet": {"done": index}} if done else {"$pull": {"done": index}}
    get_db().plans.update_one({"_id": plan['_id']}, op)
    return jsonify({"success": True, "plan": plan_view(find_own_plan(plan_id))})

@app.route('/api/plans/<plan_id>/guide', methods=['GET'])
@login_required
def get_plan_guide(plan_id):
    plan = find_own_plan(plan_id)
    if not plan:
        return jsonify({"error": "Plan not found."}), 404
    return jsonify({"success": True, "crop": plan['crop'], "language": plan.get('language', 'en'), "guide": plan.get('guide', '')})

@app.route('/api/plans/<plan_id>', methods=['DELETE'])
@login_required
def unfollow_plan(plan_id):
    plan = find_own_plan(plan_id)
    if not plan:
        return jsonify({"error": "Plan not found."}), 404
    get_db().plans.delete_one({"_id": plan['_id']})
    return jsonify({"success": True})

# --- Government schemes finder ---

@app.route('/api/schemes', methods=['POST'])
@login_required
def schemes():
    if not gemini_model:
        return jsonify({"error": "AI model not configured. Please check your GEMINI_API_KEY in .env"}), 500

    data = request.json or {}
    state = (data.get('state') or '').strip()
    if not state:
        return jsonify({"error": "Please enter your state."}), 400

    language = data.get('language', 'en')
    land = f"{data.get('land_size') or 'not given'} {data.get('unit') or ''}".strip()
    crops = (data.get('crops') or '').strip() or 'not given'
    category = data.get('category') or 'not given'
    social = data.get('social_category') or 'not given'
    woman = 'Yes' if data.get('woman') else 'No'
    needs = [n for n in (data.get('needs') or []) if n in SCHEME_NEEDS]

    prompt = f"""You are an expert on Indian government schemes for farmers. Find the schemes this farmer is most likely eligible for.

    FARMER PROFILE:
    - State: {state}
    - Land: {land}
    - Crops: {crops}
    - Farmer category: {category}
    - Social category: {social}
    - Woman farmer: {woman}
    - Looking for help with: {', '.join(needs) if needs else 'anything useful'}

    VERIFIED CENTRAL SCHEMES (use these facts and links; do not invent websites):
    {CENTRAL_SCHEMES}

    INSTRUCTIONS:
    - Recommend the 4 to 7 most relevant schemes, most useful first. Prefer the verified central schemes above.
    - You may add up to 2 well-known schemes of the {state} state government, but only ones you are confident exist; for these say "Apply via the {state} Agriculture Department" instead of giving a website.
    - Use Markdown. Start with "# Government Schemes for You". For each scheme use a "## <Scheme name>" heading followed by bullet points:
      **Benefit**, **Why you qualify**, **Documents needed**, **How to apply** (include the website if given above).
    - End with a short "## Important" note: amounts and rules change, so confirm at the official website, nearest CSC, bank or Kisan Call Centre 1800-180-1551 (free). Never ask the farmer to pay an agent.
    - Keep it simple and practical for a farmer with low literacy.

    CRITICAL: Write the entire answer in the language corresponding to language code '{language}'. Keep scheme names and website links unchanged.
    """
    try:
        response = gemini_model.generate_content(prompt)
    except Exception as e:
        print(f"Schemes error: {e}")
        return jsonify({"error": str(e)}), 500

    inputs = {"state": state, "land": land, "crops": crops, "category": category,
              "social_category": social, "woman": woman == 'Yes', "needs": needs, "language": language}
    save_history("schemes", f"Schemes for {state}" + (f" ({crops})" if crops != 'not given' else ''),
                 inputs, {"report": response.text})
    return jsonify({"success": True, "report": response.text})

if __name__ == '__main__':
    # Running on 0.0.0.0 allows other devices on the local network to access the app
    app.run(host='0.0.0.0', debug=True, port=5000)
