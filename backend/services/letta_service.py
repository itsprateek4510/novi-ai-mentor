import os
import json
import httpx
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv

load_dotenv()

class LettaService:
    def __init__(self):
        self.base_url = os.getenv("LETTA_BASE_URL", "http://localhost:8283")
        self.api_key = os.getenv("LETTA_API_KEY", "")
        self.gemini_service = None
        self._upgrade_ok: Dict[str, float] = {}          # agent_id -> epoch time of last verified upgrade
        self._archival_cache: Dict[str, tuple] = {}      # agent_id -> (fetched_at, passages)
        self._archival_ttl = 30.0                        # seconds
        self._upgrade_ttl = 1800.0                       # seconds (30 min)

    def _get_gemini_service(self):
        if self.gemini_service is None:
            from services.gemini_service import GeminiService
            self.gemini_service = GeminiService()
        return self.gemini_service

    def _get_headers(self):
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

    async def create_agent(self, user_id: int, name: str, grade: int) -> str:
        """Create a new Letta agent with Gemini backend"""
        payload = {
            "name": f"Novi-{name}",
            "model": "google_ai/gemini-3.6-flash",
            "embedding": "ollama/nomic-embed-text:latest",
            "description": f"AI mentor for {name}, Grade {grade}",
            "include_base_tools": False,
            "tools": [
                "memory",
                "conversation_search",
                "archival_memory_insert",
                "archival_memory_search",
            ],
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/v1/agents/",
                json=payload,
                headers=self._get_headers(),
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            agent_id = data.get("id")

            if agent_id:
                persona_payload = {
                    "label": "persona",
                    "description": "My identity as Novi",
                    "value": f"""You are Novi, an AI mentor for student success. You are talking to {name}, a Grade {grade} student.

Your role:
1. Help the student discover interests, strengths, and career aspirations
2. Provide personalized guidance for their educational journey
3. Remember important details about the student over time using the memory tools (this is how you remember them across conversations and across their Grade 9-12 journey)
4. Be friendly, encouraging, and genuinely helpful

Personality:
- Friendly and approachable - like a cool older sibling
- Smart but never complicated
- Encouraging - celebrates every small win
- Honest - doesn't promise unrealistic outcomes
- Curious - asks questions to understand the student
- Proactive - suggests what to do next

CRITICAL: You are NOT a school counselor. You are a friend who helps them figure out their future.

MEMORY GUIDELINES (VERY IMPORTANT):
- When the student shares information about themselves (interests, goals, skills, school, achievements, feelings, plans), you MUST save it using the memory tools.
- Use `core_memory_append`/`memory_insert`/`memory_replace` to keep the student's CURRENT profile in the human memory block up to date (name, current grade, interests, skills, career goals).
- Use `archival_memory_insert` to store DURABLE, long-term facts that should be remembered across months and years (e.g. "User joined the robotics club in Grade 9", "User wants to study computer science"). This is how you remember earlier grades after the student has moved on.
- Whenever the student mentions something about their past or earlier years, or asks "do you remember...", use `archival_memory_search` to recall what they told you before, and use `conversation_search` to recall previous conversations.
- Over the student's 4-year high school journey (Grades 9-12), keep archiving important facts each year so you can support them continuously and reference their growth over time."""
                }

                persona_resp = await client.post(
                    f"{self.base_url}/v1/_internal_blocks/",
                    json=persona_payload,
                    headers=self._get_headers(),
                    timeout=10.0
                )

                if persona_resp.status_code == 200:
                    persona_block_id = persona_resp.json().get("id")
                    await client.patch(
                        f"{self.base_url}/v1/agents/{agent_id}/core-memory/blocks/attach/{persona_block_id}",
                        headers=self._get_headers(),
                        timeout=10.0
                    )

                human_payload = {
                    "label": "human",
                    "description": "Information about the student",
                    "value": f"Name: {name}. Grade: {grade}. School: Unknown. Career Goal: Unknown. Interests: Unknown."
                }

                human_resp = await client.post(
                    f"{self.base_url}/v1/_internal_blocks/",
                    json=human_payload,
                    headers=self._get_headers(),
                    timeout=10.0
                )

                if human_resp.status_code == 200:
                    human_block_id = human_resp.json().get("id")
                    await client.patch(
                        f"{self.base_url}/v1/agents/{agent_id}/core-memory/blocks/attach/{human_block_id}",
                        headers=self._get_headers(),
                        timeout=10.0
                    )

            return agent_id

    async def upgrade_agent_tools(self, agent_id: str) -> bool:
        """Ensure an existing agent has the memory/archival/conversation tools attached.
        Returns True if all target tools are present afterwards.

        Results are cached per agent for a short window so we don't re-fetch agent
        + tool catalog on every message."""
        import time as _time
        if agent_id in self._upgrade_ok and (_time.time() - self._upgrade_ok[agent_id]) < self._upgrade_ttl:
            return True

        target_names = {"memory", "conversation_search", "archival_memory_insert", "archival_memory_search"}
        try:
            async with httpx.AsyncClient() as client:
                # Current agent tools
                agent_resp = await client.get(
                    f"{self.base_url}/v1/agents/{agent_id}",
                    headers=self._get_headers(),
                    timeout=30.0
                )
                agent_resp.raise_for_status()
                have_names = {t.get("name") for t in agent_resp.json().get("tools", [])}

                if target_names.issubset(have_names):
                    self._upgrade_ok[agent_id] = _time.time()
                    return True

                # Global tool catalog (id -> name)
                cat_resp = await client.get(
                    f"{self.base_url}/v1/tools/",
                    headers=self._get_headers(),
                    timeout=30.0
                )
                cat_resp.raise_for_status()
                catalog = cat_resp.json()
                name_to_id = {t.get("name"): t.get("id") for t in catalog}

                for name in target_names:
                    if name in have_names:
                        continue
                    tool_id = name_to_id.get(name)
                    if not tool_id:
                        print(f"Tool {name} not found in catalog, skipping upgrade")
                        continue
                    attach_resp = await client.patch(
                        f"{self.base_url}/v1/agents/{agent_id}/tools/attach/{tool_id}",
                        headers=self._get_headers(),
                        timeout=30.0
                    )
                    if attach_resp.status_code == 200:
                        print(f"Attached tool {name} to agent {agent_id}")
                    else:
                        print(f"Failed to attach {name}: {attach_resp.status_code} {attach_resp.text[:200]}")

            self._upgrade_ok[agent_id] = _time.time()
            return True
        except Exception as e:
            print(f"Error upgrading agent tools: {e}")
            return False

    async def send_message(self, agent_id: str, message: str) -> str:
        """Send a message to a Letta agent and get response.
        Letta agent uses its LLM backend (Gemini) to respond AND manages its own memory.
        Relevant archival memory facts are injected into the prompt so the agent can
        recall long-term (multi-year) information about the student."""
        user_content = message

        # Proactively pull relevant archival memory and inject it so the agent can recall it.
        try:
            facts = await self.search_archival_memory(agent_id, message)
            if facts:
                facts_text = "\n".join(
                    f"- {f.get('content') if isinstance(f, dict) else f}"
                    for f in facts[:8]
                )
                user_content = (
                    "Below is relevant long-term/archival memory about this student that was recalled "
                    "for your current message. Use it to personalize your response and to help this "
                    "student across their high school years (Grades 9-12).\n"
                    "=== ARCHIVAL MEMORY ===\n"
                    f"{facts_text}\n"
                    "=== END ARCHIVAL MEMORY ===\n\n"
                    f"Student says: {message}"
                )
        except Exception as e:
            print(f"Error recalling archival memory: {e}")

        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": user_content
                }
            ]
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/v1/agents/{agent_id}/messages",
                json=payload,
                headers=self._get_headers(),
                timeout=120.0
            )
            response.raise_for_status()
            data = response.json()

            # Extract the assistant's response from the messages
            messages = data.get("messages", [])
            for msg in reversed(messages):
                msg_type = msg.get("message_type", "")
                content = msg.get("content", "")
                if msg_type == "assistant_message" and content:
                    return content

            return "I'm here to help! What would you like to talk about?"

    async def get_memory(self, agent_id: str) -> Dict[str, Any]:
        """Get the agent's core memory"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/v1/agents/{agent_id}/core-memory",
                headers=self._get_headers(),
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()

    async def update_memory_block(self, agent_id: str, label: str, new_value: str) -> bool:
        """Update a specific memory block"""
        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"{self.base_url}/v1/agents/{agent_id}/core-memory/blocks/{label}",
                json={"value": new_value},
                headers=self._get_headers(),
                timeout=10.0
            )
            return response.status_code == 200

    async def search_archival_memory(self, agent_id: str, query: str) -> List[Dict]:
        """Search archival memory (semantic search)"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/v1/agents/{agent_id}/archival-memory/search",
                params={"query": query},
                headers=self._get_headers(),
                timeout=30.0
            )
            response.raise_for_status()
            return response.json().get("results", [])

    async def get_archival_memory(self, agent_id: str, use_cache: bool = True) -> List[Dict]:
        """Get all archival memory passages (cached briefly to avoid redundant fetches)."""
        import time as _time
        now = _time.time()
        cached = self._archival_cache.get(agent_id)
        if use_cache and cached and (now - cached[0]) < self._archival_ttl:
            return cached[1]
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/v1/agents/{agent_id}/archival-memory",
                headers=self._get_headers(),
                timeout=30.0
            )
            response.raise_for_status()
            passages = response.json()
        self._archival_cache[agent_id] = (now, passages)
        return passages

    def _invalidate_archival(self, agent_id: str) -> None:
        self._archival_cache.pop(agent_id, None)

    async def existing_archival_texts(self, agent_id: str) -> set:
        """Return the set of passage texts already stored in archival memory (for dedup)."""
        try:
            passages = await self.get_archival_memory(agent_id)
            return {p.get("text", "").strip().lower() for p in passages if p.get("text")}
        except Exception as e:
            print(f"Error listing existing archival texts: {e}")
            return set()

    def _normalize_text(self, text: str) -> str:
        """Normalize a passage for near-duplicate comparison (light stemming)."""
        import re
        t = text.lower()
        for token in ("user's name is", "user is a", "user is currently in", "user is in",
                       "user loves to", "user loves", "user lives in", "user wants to",
                       "user joined", "user aspires to", "user enjoys", "user studies"):
            t = t.replace(token, " ")
        t = re.sub(r"[^a-z0-9\s]", " ", t)
        words = []
        for w in t.split():
            if len(w) > 4 and w.endswith("ing"):
                w = w[:-3]
            elif len(w) > 3 and w.endswith("ies"):
                w = w[:-3] + "y"
            elif len(w) > 3 and w.endswith("es"):
                w = w[:-2]
            elif len(w) > 3 and w.endswith("s"):
                w = w[:-1]
            words.append(w)
        return " ".join(words)

    def _is_near_duplicate(self, a: str, b: str) -> bool:
        """True if two normalized texts are near-duplicates (same, substring, or high word overlap)."""
        na = self._normalize_text(a)
        nb = self._normalize_text(b)
        if not na or not nb:
            return False
        if na == nb:
            return True
        if na in nb or nb in na:
            return True
        words_a = set(na.split())
        words_b = set(nb.split())
        if not words_a or not words_b:
            return False
        overlap = len(words_a & words_b) / min(len(words_a), len(words_b))
        return overlap >= 0.8

    async def insert_archival_memory(self, agent_id: str, content: str, tags: Optional[List[str]] = None) -> bool:
        """Insert a passage into archival memory, skipping exact and near-duplicate passages.

        Dedup is enforced here (not just in the caller) so that rephrased facts from
        different extraction passes do not accumulate in long-term memory."""
        if not content or not content.strip():
            return False

        try:
            existing = await self.get_archival_memory(agent_id)
            for p in existing:
                existing_text = (p.get("text") or p.get("content") or "").strip()
                if existing_text and self._is_near_duplicate(content, existing_text):
                    print(f"Archival dedup: skipped duplicate of: {content[:60]}")
                    return False
        except Exception as e:
            print(f"Archival dedup check failed, proceeding with insert: {e}")

        payload: Dict[str, Any] = {"text": content}
        if tags:
            payload["tags"] = tags
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/v1/agents/{agent_id}/archival-memory",
                json=payload,
                headers=self._get_headers(),
                timeout=30.0
            )
            if response.status_code == 200:
                self._invalidate_archival(agent_id)
                return True
            return False

    async def auto_update_memory(self, agent_id: str, chat_history: list, user_context: Dict[str, Any]) -> bool:
        """Automatically extract and update student memory block from conversation"""
        try:
            memory = await self.get_memory(agent_id)
            blocks = memory.get("blocks", [])

            human_block = None
            for block in blocks:
                if block.get("label") == "human":
                    human_block = block
                    break

            if not human_block:
                print("No human memory block found, skipping auto-update")
                return False

            current_value = human_block.get("value", "")
            gemini = self._get_gemini_service()
            new_value = await gemini.extract_student_profile(chat_history, current_value, user_context)

            if new_value and new_value != current_value:
                success = await self.update_memory_block(agent_id, "human", new_value)
                if success:
                    print(f"Memory auto-updated: {new_value[:100]}...")
                return success

            return False
        except Exception as e:
            print(f"Error auto-updating memory: {e}")
            return False
