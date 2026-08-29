import os
import json
import asyncio
import time
from typing import Optional, Dict, Any
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

class GeminiService:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY", "")
        self.client = genai.Client(api_key=api_key)
        self.model = "gemini-3.6-flash"
        self.last_call_time = 0
        self.min_delay = 4  # minimum seconds between calls

        self.system_prompt = """You are Novi, an AI mentor dedicated to helping students succeed.

Your personality:
- Friendly and approachable - like a cool older sibling who's been through this
- Smart but never complicated - you explain things clearly
- Encouraging - you celebrate every small win
- Honest - you don't promise unrealistic outcomes
- Curious - you ask questions to understand the student better
- Proactive - you suggest what to do next
- Personal - you use what you know about the student

Your role:
- Help students discover their interests, strengths, and career aspirations
- Guide them through their educational journey (Grade 9-12)
- Provide personalized recommendations for careers, universities, and activities
- Remember and reference past conversations
- Make planning fun, not overwhelming

CRITICAL: You are NOT a school counselor. You are NOT an education consultant. You are a friend who helps them figure out their future.

When responding:
- Use emojis occasionally to keep it friendly
- Ask follow-up questions to learn more
- Celebrate their achievements, no matter how small
- Suggest concrete next steps
- Reference their grade level and interests when relevant

Keep responses conversational and engaging. Not too long, not too short."""

    async def generate_response(self, message: str, user_context: Optional[Dict[str, Any]] = None) -> str:
        """Generate a response using Gemini with Letta memory context"""
        for attempt in range(2):
            try:
                elapsed = time.time() - self.last_call_time
                if elapsed < self.min_delay:
                    await asyncio.sleep(self.min_delay - elapsed)

                prompt = self.system_prompt + "\n\n"

                if user_context:
                    if user_context.get("letta_memory"):
                        prompt += "=== WHAT I KNOW ABOUT THIS STUDENT (from my memory) ===\n"
                        prompt += user_context["letta_memory"] + "\n"
                        prompt += "=== END OF MEMORY ===\n\n"
                        prompt += "IMPORTANT: Use this information to personalize your response.\n\n"

                    prompt += "Student Information:\n"
                    if user_context.get("name"):
                        prompt += f"- Name: {user_context['name']}\n"
                    if user_context.get("grade"):
                        prompt += f"- Grade: {user_context['grade']}\n"
                    if user_context.get("school"):
                        prompt += f"- School: {user_context['school']}\n"
                    prompt += "\n"

                prompt += f"Student says: {message}\n\nNovi's response:"

                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt
                )
                self.last_call_time = time.time()
                return response.text

            except Exception as e:
                print(f"Gemini API error (attempt {attempt+1}): {e}")
                if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                    print("Quota exhausted - try again later or upgrade plan")
                    return "I've hit my daily conversation limit. Please try again tomorrow! 🌅 My free tier allows 20 conversations per day."
                else:
                    return "I'm having a little trouble connecting right now. Could you try again in a moment? I'm here to help!"

        return "I'm having a little trouble connecting right now. Could you try again in a moment? I'm here to help!"

    async def generate_career_dna(self, user_context: Dict[str, Any]) -> Dict[str, Any]:
        """Generate Career DNA based on conversation history"""
        try:
            prompt = f"""Based on the following student information, generate a Career DNA profile.

Student Info:
- Name: {user_context.get('name')}
- Grade: {user_context.get('grade')}
- School: {user_context.get('school')}
- Interests: {', '.join(user_context.get('interests', []))}
- Strengths: {', '.join(user_context.get('strengths', []))}
- Motivations: {', '.join(user_context.get('motivations', []))}

Generate a JSON response with:
{{
    "traits": {{"creative": 0.8, "analytical": 0.6}},
    "motivations": {{"impact": 0.9, "learning": 0.7}},
    "strengths": ["Problem Solving", "Communication"],
    "interests": ["Technology", "Arts"],
    "career_zones": ["Technology & Innovation", "Creative Industries"]
}}

Make it personalized and specific to this student. Return ONLY valid JSON."""

            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt
            )

            text = response.text
            if "```json" in text:
                json_str = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                json_str = text.split("```")[1].split("```")[0].strip()
            else:
                json_str = text

            return json.loads(json_str)

        except Exception as e:
            print(f"Error generating Career DNA: {e}")
            return {
                "traits": {},
                "motivations": {},
                "strengths": [],
                "interests": [],
                "career_zones": []
            }

    async def extract_student_insights(self, chat_history: list, user_context: Dict[str, Any]) -> Dict[str, Any]:
        """Extract structured insights from conversation history for MySQL storage"""
        for attempt in range(2):
            try:
                elapsed = time.time() - self.last_call_time
                if elapsed < self.min_delay:
                    await asyncio.sleep(self.min_delay - elapsed)

                history_text = "\n".join([f"{m['role']}: {m['content']}" for m in chat_history[-20:]])

                prompt = f"""Analyze this student conversation and extract structured data. Return ONLY valid JSON.

Student: {user_context.get('name')}, Grade {user_context.get('grade')}, {user_context.get('school')}

Conversation:
{history_text}

Extract and return this JSON:
{{
    "interests": ["list of interests mentioned"],
    "strengths": ["list of strengths/skills mentioned"],
    "career_goals": ["career paths mentioned"],
    "motivations": ["what drives the student"],
    "traits": {{"creative": 0.5, "analytical": 0.5, "leadership": 0.5, "communication": 0.5, "problem_solving": 0.5, "technical": 0.5}},
    "career_zones": ["career zones like Technology & Innovation, Creative Industries, etc"],
    "goals": [
        {{"title": "goal title", "description": "goal description", "category": "career|personal|extracurricular|academic|university"}}
    ]
}}

Use 0.0-1.0 scale for traits. Only include data actually mentioned in conversation. If nothing relevant, return empty arrays and neutral traits."""

                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt
                )
                self.last_call_time = time.time()

                text = response.text
                if "```json" in text:
                    json_str = text.split("```json")[1].split("```")[0].strip()
                elif "```" in text:
                    json_str = text.split("```")[1].split("```")[0].strip()
                else:
                    json_str = text

                return json.loads(json_str)

            except Exception as e:
                print(f"Error extracting insights (attempt {attempt+1}): {e}")
                if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                    wait = (attempt + 1) * 15
                    print(f"Rate limited on extraction, waiting {wait}s...")
                    await asyncio.sleep(wait)
                else:
                    break

        return {
            "interests": [],
            "strengths": [],
            "career_goals": [],
            "motivations": [],
            "traits": {},
            "career_zones": [],
            "goals": []
        }

    async def extract_archival_facts(self, chat_history: list, grade: Optional[int] = None, existing_facts: Optional[set] = None) -> list:
        """Extract concise durable facts from conversation for archival memory.
        Returns a list of string facts (max 5) phrased for long-term retrieval."""
        for attempt in range(2):
            try:
                elapsed = time.time() - self.last_call_time
                if elapsed < self.min_delay:
                    await asyncio.sleep(self.min_delay - elapsed)

                history_text = "\n".join([f"{m['role']}: {m['content']}" for m in chat_history[-30:]])
                grade_line = f"The student is currently in Grade {grade} (where applicable, mention the grade year in the fact, e.g. 'User joined the robotics club in Grade 9')." if grade else ""

                existing_section = "NO previously-saved facts"
                if existing_facts:
                    existing_section = "\n".join(f"- {f}" for f in sorted(existing_facts))

                prompt = f"""You are a memory extraction system. Analyze the student conversation and extract concise, durable facts worth remembering long-term.

{grade_line}

Conversation:
{history_text}

Facts ALREADY saved in archival memory (do NOT re-extract the same fact — skip anything already covered by these):
{existing_section}

Extract only NEW, specific, factual statements about the student (interests, goals, skills, schools, preferences, achievements, plans). Phrase each as a standalone sentence that can be searched semantically later.

Rules:
- Do NOT include small talk, greetings, or generic advice
- Do NOT duplicate a fact that is already in the saved facts list, nor a fact already in this same output list
- Return ONLY a JSON array of strings, e.g. ["User prefers working on robotics clubs.", "User wants to study computer science."]
- If there are no new durable facts, return an empty array []

Return ONLY valid JSON."""

                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt
                )
                self.last_call_time = time.time()

                text = response.text
                if "```json" in text:
                    json_str = text.split("```json")[1].split("```")[0].strip()
                elif "```" in text:
                    json_str = text.split("```")[1].split("```")[0].strip()
                else:
                    json_str = text

                facts = json.loads(json_str)
                if isinstance(facts, list):
                    return [str(f).strip() for f in facts if str(f).strip()][:5]
                return []

            except Exception as e:
                print(f"Error extracting archival facts (attempt {attempt+1}): {e}")
                if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                    await asyncio.sleep((attempt + 1) * 15)
                else:
                    break

        return []

    async def extract_student_profile(self, chat_history: list, current_memory: str, user_context: Optional[Dict[str, Any]] = None) -> str:
        """Extract latest student profile from conversation for Letta memory update"""
        for attempt in range(2):
            try:
                elapsed = time.time() - self.last_call_time
                if elapsed < self.min_delay:
                    await asyncio.sleep(self.min_delay - elapsed)

                history_text = "\n".join([f"{m['role']}: {m['content']}" for m in chat_history[-30:]])

                user_info = ""
                if user_context:
                    name = user_context.get("name", "Unknown")
                    grad = user_context.get("grade", "Unknown")
                    schl = user_context.get("school") or "Unknown"
                    user_info = f"Known user info (authoritative for Name/Grade/School fields): Name: {name}. Grade: {grad}. School: {schl}.\n"

                prompt = f"""You are a memory extraction system. Analyze the conversation and extract the student's profile.

Current memory block:
{current_memory}

{user_info}
Conversation:
{history_text}

Extract the LATEST student information and return ONLY the updated memory block text in this exact format:
Name: [name]. Grade: [grade]. School: [school]. Career Goal: [goal]. Interests: [interests]. Skills: [skills]. Motivations: [motivations]. Preferred Roles: [roles]. Learning Style: [style].

Rules:
- Name, Grade, School come from the known user info above; use it when the conversation doesn't state otherwise
- Use ONLY information explicitly mentioned in the conversation for the other fields
- If a field wasn't mentioned, keep the value from current memory
- Return ONLY the memory text, no JSON, no explanation"""

                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt
                )
                self.last_call_time = time.time()
                return response.text.strip()

            except Exception as e:
                print(f"Error extracting profile (attempt {attempt+1}): {e}")
                if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                    await asyncio.sleep((attempt + 1) * 15)
                else:
                    break

        return current_memory
