from flask import Flask, request, jsonify, render_template
import os
import requests
import tensorflow as tf
import numpy as np
from PIL import Image
import io
from dotenv import load_dotenv
import google.generativeai as genai
from utils.disease_info import disease_remedies, disease_fertilizers

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

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/predict', methods=['POST'])
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
                import json
                trans_dict = json.loads(trans_text.strip())
                
                translated_prediction = trans_dict.get('predicted_class', formatted_name)
                remedies = trans_dict.get('remedies', remedies)
                fertilizers = trans_dict.get('fertilizers', fertilizers)
            except Exception as e:
                print("Translation fallback failed:", e)
        
        return jsonify({
            "success": True,
            "prediction": formatted_name,
            "translated_prediction": translated_prediction,
            "is_healthy": is_healthy,
            "remedies": remedies,
            "fertilizers": fertilizers
        })
        
    except Exception as e:
        print(f"Error during prediction: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    if not gemini_model:
        return jsonify({"error": "AI model not configured. Please check your GEMINI_API_KEY in .env"}), 500
        
    # Handle both JSON and form data (for image uploads)
    if request.is_json:
        user_message = request.json.get('message', '')
        language = request.json.get('language', 'en')
        img_file = None
    else:
        user_message = request.form.get('message', '')
        language = request.form.get('language', 'en')
        img_file = request.files.get('image')

    if not user_message and not img_file:
        return jsonify({"error": "No message or image provided"}), 400
    
    try:
        # Provide context to the AI
        prompt = f"""You are Kissan Sarthi AI, an expert agricultural advisor and farming assistant.
        Your goal is to help farmers with crop management, disease prevention, and general farming practices.
        Keep your answers concise, practical, and highly relevant to farming.
        
        CRITICAL: You MUST answer entirely in the language corresponding to language code '{language}'.
        
        User's question: {user_message}"""
        
        content_to_send = [prompt]
        
        if img_file and img_file.filename != '':
            img_bytes = img_file.read()
            img = Image.open(io.BytesIO(img_bytes))
            content_to_send.append(img)
        
        response = gemini_model.generate_content(content_to_send)
        return jsonify({"success": True, "reply": response.text})
    except Exception as e:
        print(f"Chat error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/weather', methods=['POST'])
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
        
        Based on this weather outlook, please provide a detailed agricultural advisory structured exactly with these three headings:
        
        ### 1. Recommended Actions for Farmers
        (Provide 2-3 immediate, actionable steps farmers should take right now based on the current weather and upcoming forecast.)
        
        ### 2. Precautions for Current Crops
        (Identify any risks such as frost, heat stress, drought, or fungal/pest outbreaks due to the forecasted humidity and temperature. Detail what precautions to take for already sown crops.)
        
        ### 3. Sowing Recommendations
        (Suggest specific crops, vegetables, or plants that are ideal to sow or prepare for during this weather window in this region. If the weather is highly unfavorable for sowing, explicitly advise them to wait and explain why.)
        
        CRITICAL: You MUST write your entire advisory in the language corresponding to language code '{language}'.
        """
        
        advisory_response = gemini_model.generate_content(prompt)
        
        return jsonify({
            "success": True, 
            "weather": {
                "temp": temp,
                "humidity": humidity,
                "description": description.capitalize() if isinstance(description, str) else description
            },
            "forecast": parsed_forecast,
            "advisory": advisory_response.text
        })
    except Exception as e:
        print(f"Weather advisory error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/guidebook', methods=['POST'])
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
        Generate a comprehensive, colorful, zero-to-hero "Crop Farming Guidebook".
        Use extensive Markdown formatting (Headers like #, ##, tables, bold text, bullet points) to make it look like a highly professional PDF document.
        
        CRITICAL: The ENTIRE guidebook must be written in {language}.
        
        Must include the following sections exactly:
        # {crop.title()} Cultivation Guide
        
        ## 1. Soil Preparation & Sowing
        (Explain how to treat this specific {soil} soil before sowing, exact depth, and spacing for the seeds).
        
        ## 2. Recommended Fertilizers
        (Provide specific organic/chemical fertilizer names, NPK ratios, and exact times of application).
        
        ## 3. Day-by-Day / Week-by-Week Schedule
        (Create a Markdown Table showing a timeline from Day 1 to Harvest. Include columns for 'Timeline', 'Stage', and 'Action Required').
        
        ## 4. Pest & Disease Management
        (List top 2 common diseases for this crop and how to prevent them organically).
        
        ## 5. Harvesting Guidelines
        (How to know it's ready, and exact steps to harvest).
        
        ## 6. Executive Summary
        (A final 1-page summary stating the key points, total estimated duration from sowing to harvest, and the absolute best methods for success).
        """
        
        guide_response = gemini_model.generate_content(prompt)
        
        return jsonify({
            "success": True, 
            "guide": guide_response.text
        })
    except Exception as e:
        print(f"Guidebook error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/economics', methods=['POST'])
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
        
        return jsonify({
            "success": True, 
            "report": report_response.text
        })
    except Exception as e:
        print(f"Economics error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Running on 0.0.0.0 allows other devices on the local network to access the app
    app.run(host='0.0.0.0', debug=True, port=5000)
