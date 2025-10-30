import asyncio
from concurrent.futures import ThreadPoolExecutor
import re
from typing import List, Dict
import logging
import os
import google.generativeai as genai

logger = logging.getLogger(__name__)

class SummaryService:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=2)
        
        # Initialize Gemini
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        self.use_gemini = bool(self.gemini_api_key)
        
        if self.use_gemini:
            try:
                genai.configure(api_key=self.gemini_api_key)
                self.model = genai.GenerativeModel('gemini-pro')
                logger.info("Gemini API initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini: {e}")
                self.use_gemini = False
        else:
            logger.warning("Gemini API key not found, using rule-based summarization")
        
        # Keywords for fallback rule-based approach
        self.meeting_keywords = {
            'start': ['starting', 'begin', 'start', 'commence'],
            'assignment': ['will be doing', 'responsible for', 'assigned to', 'will do', 'will handle'],
            'end': ['end', 'conclude', 'finish', 'thank you', 'that\'s all'],
            'discussion': ['discuss', 'talk about', 'review', 'go over'],
            'decision': ['decided', 'agreed', 'concluded', 'determined']
        }
    
    async def generate_summary(self, transcript: str) -> str:
        """Generate a concise meeting summary using Gemini or fallback to rule-based"""
        
        # Try Gemini first if available
        if self.use_gemini:
            try:
                summary = await self._generate_with_gemini(transcript)
                if summary:
                    return summary
            except Exception as e:
                logger.error(f"Gemini summary generation failed: {e}, falling back to rule-based")
        
        # Fallback to rule-based approach
        loop = asyncio.get_event_loop()
        
        def _summarize():
            try:
                cleaned_transcript = self._clean_transcript(transcript)
                summary_components = self._extract_summary_components(cleaned_transcript)
                summary = self._build_summary(summary_components)
                return summary
            except Exception as e:
                logger.error(f"Rule-based summary generation failed: {str(e)}")
                return self._simple_extractive_summary(transcript)
        
        try:
            summary = await loop.run_in_executor(self.executor, _summarize)
            return summary.strip()
        except Exception as e:
            logger.error(f"Async summary generation failed: {str(e)}")
            return self._simple_extractive_summary(transcript)
    
    async def _generate_with_gemini(self, transcript: str) -> str:
        """Generate summary using Gemini API"""
        loop = asyncio.get_event_loop()
        
        def _call_gemini():
            prompt = f"""You are analyzing a meeting transcript. Create a concise, well-structured meeting summary.

**Instructions:**
1. Identify all participants mentioned in the meeting
2. Extract key discussion points and topics covered
3. List all task assignments with assignees
4. Note any important decisions made
5. Format the summary in a clear, professional manner

**Transcript:**
{transcript}

**Summary Format:**
Meeting Participants: [List names]

Key Discussion Points:
• [Point 1]
• [Point 2]
...

Task Assignments:
• [Name]: [Task description]
• [Name]: [Task description]
...

Decisions Made:
• [Decision 1]
• [Decision 2]
...

Meeting Status: [Brief status note]

Keep the summary concise but comprehensive. Focus on actionable items and key takeaways."""

            response = self.model.generate_content(prompt)
            return response.text.strip()
        
        try:
            summary = await loop.run_in_executor(self.executor, _call_gemini)
            logger.info("Successfully generated summary with Gemini")
            return summary
        except Exception as e:
            logger.error(f"Gemini API call failed: {e}")
            return None
    
    def _clean_transcript(self, transcript: str) -> str:
        """Clean transcript for better processing"""
        cleaned = ' '.join(transcript.split())
        cleaned = re.sub(r'\b[Bb]ria\b', 'Ria', cleaned)
        cleaned = re.sub(r'\bmeet\b', 'meeting', cleaned)
        cleaned = re.sub(r'\b(um|uh|er|ah)\b', '', cleaned, flags=re.IGNORECASE)
        return cleaned
    
    def _extract_summary_components(self, transcript: str) -> Dict:
        """Extract key components for summary generation"""
        components = {
            'meeting_type': 'meeting',
            'participants': [],
            'assignments': [],
            'key_points': [],
            'decisions': [],
            'next_steps': []
        }
        
        sentences = re.split(r'[.!?]+', transcript)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        for sentence in sentences:
            sentence_lower = sentence.lower()
            
            participants = self._extract_participants(sentence)
            components['participants'].extend(participants)
            
            assignments = self._extract_assignments_for_summary(sentence)
            components['assignments'].extend(assignments)
            
            if self._is_key_point(sentence):
                components['key_points'].append(sentence)
            
            if any(keyword in sentence_lower for keyword in self.meeting_keywords['decision']):
                components['decisions'].append(sentence)
        
        components['participants'] = list(set(components['participants']))
        components['assignments'] = self._deduplicate_assignments(components['assignments'])
        
        return components
    
    def _extract_participants(self, sentence: str) -> List[str]:
        """Extract participant names from sentence"""
        potential_names = re.findall(r'\b[A-Z][a-z]+\b', sentence)
        common_words = {'Hello', 'This', 'That', 'The', 'We', 'You', 'They', 'So', 'Now', 'Thank', 'Yeah'}
        names = [name for name in potential_names if name not in common_words]
        return names
    
    def _extract_assignments_for_summary(self, sentence: str) -> List[Dict]:
        """Extract assignment information for summary"""
        assignments = []
        pattern = r'(\w+)\s+(?:you\s+)?will\s+be\s+doing\s+(?:the\s+)?(.+?)(?:\s+and|$|\.|,)'
        matches = re.finditer(pattern, sentence, re.IGNORECASE)
        
        for match in matches:
            assignee = match.group(1).strip()
            task = match.group(2).strip()
            task = re.sub(r'\b(so|yeah|that|is|the|end|of|our|meeting?)\b.*$', '', task, flags=re.IGNORECASE).strip()
            
            if len(task) > 3:
                assignments.append({
                    'assignee': assignee,
                    'task': task
                })
        
        return assignments
    
    def _deduplicate_assignments(self, assignments: List[Dict]) -> List[Dict]:
        """Remove duplicate assignments"""
        seen = set()
        unique_assignments = []
        
        for assignment in assignments:
            key = f"{assignment['assignee']}-{assignment['task'][:15]}"
            if key not in seen:
                seen.add(key)
                unique_assignments.append(assignment)
        
        return unique_assignments
    
    def _is_key_point(self, sentence: str) -> bool:
        """Determine if sentence contains a key point"""
        sentence_lower = sentence.lower()
        
        if len(sentence) < 15:
            return False
        
        skip_phrases = ['hello', 'thank you', 'end of our meet', 'starting with our meet']
        if any(phrase in sentence_lower for phrase in skip_phrases):
            return False
        
        important_keywords = ['will be doing', 'responsible for', 'assigned', 'will handle', 'need to', 'should']
        return any(keyword in sentence_lower for keyword in important_keywords)
    
    def _build_summary(self, components: Dict) -> str:
        """Build structured summary from components"""
        summary_parts = []
        
        if components['participants']:
            participants_str = ', '.join(components['participants'])
            summary_parts.append(f"Meeting Participants: {participants_str}")
            summary_parts.append("")
        
        if components['assignments']:
            summary_parts.append("Task Assignments:")
            for assignment in components['assignments']:
                summary_parts.append(f"• {assignment['assignee']}: {assignment['task']}")
            summary_parts.append("")
        
        significant_points = [point for point in components['key_points'] 
                            if len(point) > 20 and not any(skip in point.lower() 
                            for skip in ['hello', 'thank', 'end', 'start'])
                            and not any(assignment.get('task', '').lower() in point.lower() 
                            for assignment in components['assignments'])]
        
        if significant_points:
            summary_parts.append("Key Discussion Points:")
            for point in significant_points[:3]:
                summary_parts.append(f"• {point}")
            summary_parts.append("")
        
        summary_parts.append("Meeting Status: Completed with task assignments distributed")
        
        if len([p for p in summary_parts if p.strip()]) <= 2:
            return self._simple_extractive_summary(components.get('original_transcript', ''))
        
        return '\n'.join(summary_parts)
    
    def _simple_extractive_summary(self, transcript: str) -> str:
        """Generate simple extractive summary as fallback"""
        sentences = re.split(r'[.!?]+', transcript)
        sentences = [s.strip() for s in sentences if s.strip() and len(s) > 10]
        
        filtered_sentences = []
        for sentence in sentences:
            sentence_lower = sentence.lower()
            if not any(skip in sentence_lower for skip in ['hello', 'thank you', 'end of our meet', 'yeah']):
                filtered_sentences.append(sentence)
        
        if filtered_sentences:
            scored_sentences = []
            for sentence in filtered_sentences:
                score = len(sentence)
                if any(keyword in sentence.lower() for keyword in ['will', 'doing', 'responsible', 'assigned']):
                    score += 50
                scored_sentences.append((score, sentence))
            
            scored_sentences.sort(reverse=True)
            selected = [sentence for score, sentence in scored_sentences[:3]]
            
            formatted_summary = "Meeting Summary:\n"
            for sentence in selected:
                formatted_summary += f"• {sentence}\n"
            
            return formatted_summary.strip()
        
        return "Meeting Summary:\n• Meeting discussion took place with task assignments and coordination."

# Global instance
summary_service = SummaryService()