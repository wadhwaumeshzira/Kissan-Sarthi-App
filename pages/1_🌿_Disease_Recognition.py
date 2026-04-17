import streamlit as st
import tensorflow as tf
import numpy as np
from PIL import Image
from utils.disease_info import disease_remedies, disease_fertilizers

st.set_page_config(page_title="Disease Recognition", page_icon="🌿", layout="wide")

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

# Helper function to load model and predict
@st.cache_resource
def load_model():
    # Load model from the root directory
    model = tf.keras.models.load_model("trained_plant_disease_model_fixed.keras", compile=False)
    return model

def model_prediction(model, image_data):
    # Preprocess image
    image = tf.keras.preprocessing.image.load_img(image_data, target_size=(128, 128))
    input_arr = tf.keras.preprocessing.image.img_to_array(image)
    input_arr = np.array([input_arr]) # Convert single image to a batch
    predictions = model.predict(input_arr)
    return np.argmax(predictions) # Return index of max element

# Page UI
st.title("🌿 Plant Disease Recognition")
st.markdown("Upload an image of a plant leaf to detect diseases and get organic remedy & fertilizer recommendations.")

# Image Uploader
test_image = st.file_uploader("Choose a Leaf Image:", type=["jpg", "jpeg", "png"])

if test_image is not None:
    # Display the uploaded image
    st.image(test_image, caption="Uploaded Image", width=400)
    
    # Predict button
    if st.button("Predict Disease", type="primary"):
        with st.spinner("Analyzing image..."):
            try:
                # Load model and predict
                model = load_model()
                result_index = model_prediction(model, test_image)
                predicted_class = CLASS_NAMES[result_index]
                
                # Display Prediction Result
                st.subheader("Analysis Result")
                if "healthy" in predicted_class.lower():
                    st.success(f"**Prediction:** {predicted_class.replace('___', ' - ').replace('_', ' ')}")
                else:
                    st.error(f"**Prediction:** {predicted_class.replace('___', ' - ').replace('_', ' ')}")

                st.divider()

                # Create two columns for Remedies and Fertilizers
                col1, col2 = st.columns(2)
                
                with col1:
                    st.markdown("### 🍃 Organic Remedies")
                    remedies = disease_remedies.get(predicted_class, ["No specific remedies found."])
                    for remedy in remedies:
                        st.markdown(f"- {remedy}")

                with col2:
                    st.markdown("### 🌱 Recommended Fertilizers")
                    fertilizers = disease_fertilizers.get(predicted_class, ["No specific fertilizers found."])
                    for fertilizer in fertilizers:
                        st.markdown(f"- {fertilizer}")
                        
            except Exception as e:
                st.error(f"An error occurred during prediction: {e}")
