import streamlit as st

st.set_page_config(page_title="PlantEase - Home", page_icon="🌿", layout="wide")

st.header("🌿 PLANT DISEASE RECOGNITION SYSTEM")

# We can safely try to load the image if it exists
try:
    st.image("home_page.jpeg", use_column_width=True)
except Exception:
    pass

st.markdown("""
Welcome to the Plant Disease Recognition System! 🌿🔍

Our mission is to help in identifying plant diseases efficiently. Upload an image of a plant leaf, and our system will analyze it to detect any signs of diseases, providing organic cures and fertilizer recommendations.

### 🌟 Features
1. **Disease Recognition:** Upload an image to detect 38 different plant diseases and get instant organic remedies and fertilizer suggestions.
2. **AI Farming Assistant:** (Coming Soon) Ask our intelligent bot any farming-related questions.
3. **Weather & Crop Advisory:** (Coming Soon) Get real-time weather and crop care advice based on your location.

### 🚀 Get Started
Select **Disease Recognition** from the sidebar to begin analyzing your plant images!
""")
