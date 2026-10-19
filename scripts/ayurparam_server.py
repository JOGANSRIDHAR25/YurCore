import os
import sys
import time
import threading
# pyrefly: ignore [missing-import]
from flask import Flask, request, jsonify
from flask_cors import CORS
# pyrefly: ignore [missing-import]
import torch
# pyrefly: ignore [missing-import]
from transformers import AutoTokenizer, AutoModelForCausalLM

# Setup Flask application
app = Flask(__name__)
CORS(app)

MODEL_ID = "bharatgenai/AyurParam"

# Global state for model loading
model_state = {
    "loaded": False,
    "message": "Model not loaded. Click 'Initialize Model' to begin.",
    "progress": 0,
    "error": None
}

# In-memory references for model components
model = None
tokenizer = None
device = "cpu"

def load_model_thread():
    global model_state, model, tokenizer, device
    try:
        model_state["loaded"] = False
        model_state["error"] = None
        model_state["progress"] = 10
        model_state["message"] = "Initializing environment and verifying hardware..."
        
        # Check device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Loading AyurParam model on device: {device}")
        
        model_state["progress"] = 25
        model_state["message"] = f"Loading tokenizer for {MODEL_ID}..."
        tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
        
        model_state["progress"] = 50
        model_state["message"] = f"Loading model weights for {MODEL_ID} (this might take a few minutes)..."
        
        model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.float32 if device == "cpu" else torch.float16,
            trust_remote_code=True
        ).to(device)
        
        model_state["progress"] = 90
        model_state["message"] = "Model warming up and compiling execution graph..."
        
        # Run warm-up
        inputs = tokenizer("Namaste", return_tensors="pt").to(device)
        with torch.no_grad():
            model.generate(**inputs, max_new_tokens=5)
            
        model_state["progress"] = 100
        model_state["message"] = "AyurParam model loaded successfully and active!"
        model_state["loaded"] = True
        print("AyurParam model loaded successfully.")
        
    except Exception as e:
        model_state["error"] = str(e)
        model_state["message"] = "Model loading failed!"
        model_state["progress"] = 0
        model_state["loaded"] = False
        print(f"LOAD ERROR: {e}", file=sys.stderr)

@app.route("/status", methods=["GET"])
def get_status():
    return jsonify(model_state)

@app.route("/load", methods=["POST"])
def trigger_load():
    global model_state
    if model_state["loaded"] or (model_state["progress"] > 0 and model_state["error"] is None):
        return jsonify({"status": "already_loading_or_loaded", "state": model_state})
    
    thread = threading.Thread(target=load_model_thread)
    thread.daemon = True
    thread.start()
    
    model_state["message"] = "Starting model load thread..."
    model_state["progress"] = 5
    model_state["error"] = None
    
    return jsonify({"status": "started", "state": model_state})

@app.route("/chat", methods=["POST"])
def chat():
    global model_state, model, tokenizer, device
    if not model_state["loaded"]:
        return jsonify({"error": "Model is not loaded yet."}), 400
    
    data = request.json or {}
    user_message = data.get("message", "")
    role = data.get("role", "patient")
    
    if not user_message.strip():
        return jsonify({"error": "Empty message."}), 400
        
    try:
        if model is None or tokenizer is None:
            return jsonify({"error": "Model loaded state is corrupted. Reloading recommended."}), 500
            
        system_role = (
            "You are a clinical assistant helping a Vaidya (Doctor)." 
            if role == "practitioner" 
            else "You are a friendly wellness companion helping a patient (Rogi)."
        )
        prompt = f"### System:\n{system_role}\n\n### Instruction:\n{user_message}\n\n### Response:\n"
        inputs = tokenizer(prompt, return_tensors="pt").to(device)
        
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=256, # Fast limit for local CPU runtimes
                do_sample=True,
                temperature=0.7,
                top_p=0.9,
                repetition_penalty=1.1
            )
            
        decoded = tokenizer.decode(outputs[0], skip_special_tokens=True)
        
        if prompt in decoded:
            response_text = decoded.split(prompt)[-1].strip()
        else:
            response_text = decoded.replace(prompt, "").strip()
            
        return jsonify({"response": response_text})
        
    except Exception as e:
        print(f"CHAT ERROR: {e}", file=sys.stderr)
        return jsonify({"error": f"Inference failed: {str(e)}"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("AYURPARAM_PORT", 5001))
    print(f"Starting AyurParam backend microservice on port {port}...")
    app.run(host="127.0.0.1", port=port, debug=False)
