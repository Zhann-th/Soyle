import pickle
import sys

RESPONSES = {
    "greetings": "Сәлеметсіз бе! Мен сіздің жаңа жасанды интеллектіңізбін.",
    "thanks": "Оқасы жоқ! Тағы қалай көмектесе аламын?",
    "goodbye": "Сау болыңыз! Күніңіз сәтті өтсін.",
    "weather": "Менде әзірге интернетке қосылу мүмкіндігі жоқ, бірақ далада күн жақсы деп үміттенемін!",
    "time": "Кешіріңіз, менде сағат жоқ, бірақ уақытты тиімді пайдаланыңыз!",
    "bot_name": "Менің атым - QazaqAI. Мен қазақша түсінуді үйреніп жатырмын."
}

def main():
    print("🤖 ИИ 'мозгын' жүктеп жатырмын (загрузка модели)...")
    try:
        with open("kazakh_model.pkl", "rb") as f:
            model = pickle.load(f)
    except FileNotFoundError:
        print("❌ Қате! Модель табылған жоқ. Алдымен 'python train.py' командасын орындаңыз.")
        sys.exit(1)

    print("✅ ИИ дайын! (Тоқтату үшін 'exit' немесе 'шығу' деп жазыңыз)\n")

    while True:
        user_input = input("🗣 Сіз: ")
        if user_input.lower() in ["exit", "шығу", "quit"]:
            print("🤖 QazaqAI: Сау болыңыз!")
            break
            
        if not user_input.strip():
            continue

        
        prediction = model.predict([user_input])[0]
        
        
        probabilities = model.predict_proba([user_input])[0]
        max_prob = max(probabilities) * 100

        
        if max_prob < 20: 
            response = "Кешіріңіз, мен бұл сөздің мағынасын әлі үйренбедім."
        else:
            response = RESPONSES.get(prediction, "Түсінбедім.")

        print(f"🤖 QazaqAI: {response}")
        print(f"   [Дебаг: Распознано как '{prediction}' с уверенностью {max_prob:.1f}%]\n")

if __name__ == "__main__":
    main()
