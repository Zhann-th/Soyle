import json
import pickle
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
def main():
    print("🤖 Загрузка данных на казахском языке...")
    with open("dataset.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    texts = [item["text"] for item in data]
    labels = [item["intent"] for item in data]
    print(f"📊 Найдено {len(texts)} примеров. Начинаем обучение ИИ (Neural Network)...")
    model = make_pipeline(
        TfidfVectorizer(analyzer='char_wb', ngram_range=(2, 5)), 
        MLPClassifier(hidden_layer_sizes=(50,), max_iter=1000, random_state=42) 
    )
    model.fit(texts, labels)
    with open("kazakh_model.pkl", "wb") as f:
        pickle.dump(model, f)
    print("✅ Обучение завершено! Модель сохранена в файл 'kazakh_model.pkl'")
if __name__ == "__main__":
    main()