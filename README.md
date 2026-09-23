# Soyle (Сөйле)

Soyle is a machine learning project I put together to help people practice speaking Kazakh. The goal was to create an AI trainer that can listen to speech and give feedback to help users reach a native level of fluency.

At the core of the project is a custom machine learning model trained specifically for Kazakh language processing. 

## What it does
- Analyzes speech and text input in real-time.
- Uses a custom trained model (stored in kazakh_model.pkl).
- Serves predictions through a Python backend API.

## How to use it
1. Install the required Python packages from requirements.txt.
2. Run server.py to start the backend.
3. Open the frontend files in your browser to interact with the API.

If you want to train the model on new data, you can check out the train.py script.
