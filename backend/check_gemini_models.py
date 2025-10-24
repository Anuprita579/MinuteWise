# check_gemini_models.py
# Run this to see which Gemini models are available for your API key

import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("ERROR: GEMINI_API_KEY not found in environment")
    exit(1)

genai.configure(api_key=api_key)

print("=" * 80)
print("CHECKING AVAILABLE GEMINI MODELS")
print("=" * 80)
print()

try:
    models = genai.list_models()
    content_generation_models = []
    
    for model in models:
        if 'generateContent' in model.supported_generation_methods:
            content_generation_models.append(model.name)
            print(f"✓ {model.name}")
            print(f"  Display Name: {model.display_name}")
            print(f"  Description: {model.description[:100]}...")
            print()
    
    if content_generation_models:
        print("=" * 80)
        print(f"Found {len(content_generation_models)} models that support content generation")
        print("=" * 80)
        print()
        print("Recommended model to use:")
        
        # Priority order for best models
        priorities = [
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-pro',
            'gemini-1.0-pro'
        ]
        
        for priority in priorities:
            for model_name in content_generation_models:
                if priority in model_name.lower():
                    print(f"  >>> {model_name}")
                    print()
                    print("Update your code to use:")
                    print(f"  self.model = genai.GenerativeModel('{model_name}')")
                    exit(0)
        
        # If no priority match, use first available
        print(f"  >>> {content_generation_models[0]}")
        print()
        print("Update your code to use:")
        print(f"  self.model = genai.GenerativeModel('{content_generation_models[0]}')")
    else:
        print("⚠️  No models found that support content generation")
        print("Please check your API key and permissions")
        
except Exception as e:
    print(f"ERROR: {e}")
    print()
    print("Possible issues:")
    print("1. Invalid API key")
    print("2. API not enabled for your account")
    print("3. Network connection issues")
    print()
    print("Try:")
    print("  - Verify your API key at https://makersuite.google.com/app/apikey")
    print("  - Enable the Gemini API in Google Cloud Console")