# Soyle: AI Kazakh Language Trainer

**Soyle** (Сөйле) is a machine learning-powered educational tool designed to help users achieve native-level speech practice and fluency in the Kazakh language.

## Features
- **Custom ML Model:** Built and trained specifically for NLP tasks in the Kazakh language (`kazakh_model.pkl`).
- **Interactive Training:** Provides real-time speech and text analysis for immersive learning.
- **RESTful Backend:** Python-based API to handle predictions and training routines.

## Tech Stack
- **Machine Learning:** Scikit-Learn / TensorFlow, Python
- **Backend API:** Python (Flask/FastAPI)
- **Frontend:** HTML5, CSS3, JavaScript

## Running Locally

1. **Install Dependencies:**
   Ensure you have Python 3.8+ installed.
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the Backend Server:**
   ```bash
   python server.py
   # or node server.js (if using the Node wrapper)
   ```

3. **Train the Model (Optional):**
   If you want to retrain the model on new data:
   ```bash
   python train.py
   ```
