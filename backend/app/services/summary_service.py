import asyncio
from concurrent.futures import ThreadPoolExecutor
import re
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)

class SummaryService:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=2)
        
        # Keywords that indicate meeting structure
        self.meeting_keywords = {
            'start': ['starting', 'begin', 'start', 'commence'],
            'assignment': ['will be doing', 'responsible for', 'assigned to', 'will do', 'will handle'],
            'end': ['end', 'conclude', 'finish', 'thank you', 'that\'s all'],
            'discussion': ['discuss', 'talk about', 'review', 'go over'],
            'decision': ['decided', 'agreed', 'concluded', 'determined']
        }
    
    async def generate_summary(self, transcript: str) -> str:
        """Generate a concise meeting summary using rule-based approach"""
        loop = asyncio.get_event_loop()
        
        def _summarize():
            try:
                # Clean the transcript
                cleaned_transcript = self._clean_transcript(transcript)
                
                # Extract key information
                summary_components = self._extract_summary_components(cleaned_transcript)
                
                # Generate structured summary
                summary = self._build_summary(summary_components)
                
                return summary
                
            except Exception as e:
                logger.error(f"Summary generation failed: {str(e)}")
                # Fallback to simple extractive summary
                return self._simple_extractive_summary(transcript)
        
        try:
            summary = await loop.run_in_executor(self.executor, _summarize)
            return summary.strip()
        except Exception as e:
            logger.error(f"Async summary generation failed: {str(e)}")
            return self._simple_extractive_summary(transcript)
    
    def _clean_transcript(self, transcript: str) -> str:
        """Clean transcript for better processing"""
        # Normalize whitespace
        cleaned = ' '.join(transcript.split())
        
        # Fix common transcription errors
        cleaned = re.sub(r'\b[Bb]ria\b', 'Ria', cleaned)
        cleaned = re.sub(r'\bmeet\b', 'meeting', cleaned)
        
        # Remove filler words and repetitions
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
        
        # Split into sentences
        sentences = re.split(r'[.!?]+', transcript)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        for sentence in sentences:
            sentence_lower = sentence.lower()
            
            # Extract participants (names mentioned)
            participants = self._extract_participants(sentence)
            components['participants'].extend(participants)
            
            # Extract assignments
            assignments = self._extract_assignments_for_summary(sentence)
            components['assignments'].extend(assignments)
            
            # Extract key points
            if self._is_key_point(sentence):
                components['key_points'].append(sentence)
            
            # Extract decisions
            if any(keyword in sentence_lower for keyword in self.meeting_keywords['decision']):
                components['decisions'].append(sentence)
        
        # Remove duplicates and clean up
        components['participants'] = list(set(components['participants']))
        components['assignments'] = self._deduplicate_assignments(components['assignments'])
        
        return components
    
    def _extract_participants(self, sentence: str) -> List[str]:
        """Extract participant names from sentence"""
        # Look for capitalized words that could be names
        potential_names = re.findall(r'\b[A-Z][a-z]+\b', sentence)
        
        # Filter out common words that aren't names
        common_words = {'Hello', 'This', 'That', 'The', 'We', 'You', 'They', 'So', 'Now', 'Thank', 'Yeah'}
        names = [name for name in potential_names if name not in common_words]
        
        return names
    
    def _extract_assignments_for_summary(self, sentence: str) -> List[Dict]:
        """Extract assignment information for summary"""
        assignments = []
        
        # Pattern for "Name will be doing X"
        pattern = r'(\w+)\s+(?:you\s+)?will\s+be\s+doing\s+(?:the\s+)?(.+?)(?:\s+and|$|\.|,)'
        matches = re.finditer(pattern, sentence, re.IGNORECASE)
        
        for match in matches:
            assignee = match.group(1).strip()
            task = match.group(2).strip()
            
            # Clean up task description
            task = re.sub(r'\b(so|yeah|that|is|the|end|of|our|meeting?)\b.*$', '', task, flags=re.IGNORECASE).strip()
            
            if len(task) > 3:  # Minimum task length
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
        
        # Skip very short sentences or common phrases
        if len(sentence) < 15:
            return False
        
        # Skip greeting and closing phrases
        skip_phrases = ['hello', 'thank you', 'end of our meet', 'starting with our meet']
        if any(phrase in sentence_lower for phrase in skip_phrases):
            return False
        
        # Include sentences with assignments or important information
        important_keywords = ['will be doing', 'responsible for', 'assigned', 'will handle', 'need to', 'should']
        return any(keyword in sentence_lower for keyword in important_keywords)
    
    def _build_summary(self, components: Dict) -> str:
        """Build structured summary from components"""
        summary_parts = []
        
        # Meeting opening
        if components['participants']:
            participants_str = ', '.join(components['participants'])
            summary_parts.append(f"Meeting Participants: {participants_str}")
            summary_parts.append("")  # Add blank line
        
        # Task assignments
        if components['assignments']:
            summary_parts.append("Task Assignments:")
            for assignment in components['assignments']:
                summary_parts.append(f"• {assignment['assignee']}: {assignment['task']}")
            summary_parts.append("")  # Add blank line
        
        # Key points (if any significant ones that aren't just repetitions of assignments)
        significant_points = [point for point in components['key_points'] 
                            if len(point) > 20 and not any(skip in point.lower() 
                            for skip in ['hello', 'thank', 'end', 'start'])
                            and not any(assignment.get('task', '').lower() in point.lower() 
                            for assignment in components['assignments'])]
        
        if significant_points:
            summary_parts.append("Key Discussion Points:")
            for point in significant_points[:3]:  # Limit to top 3
                summary_parts.append(f"• {point}")
            summary_parts.append("")  # Add blank line
        
        # Add meeting conclusion
        summary_parts.append("Meeting Status: Completed with task assignments distributed")
        
        # Fallback if no structured content
        if len([p for p in summary_parts if p.strip()]) <= 2:
            return self._simple_extractive_summary(components.get('original_transcript', ''))
        
        return '\n'.join(summary_parts)
    
    def _simple_extractive_summary(self, transcript: str) -> str:
        """Generate simple extractive summary as fallback"""
        sentences = re.split(r'[.!?]+', transcript)
        sentences = [s.strip() for s in sentences if s.strip() and len(s) > 10]
        
        # Remove greetings and closings
        filtered_sentences = []
        for sentence in sentences:
            sentence_lower = sentence.lower()
            if not any(skip in sentence_lower for skip in ['hello', 'thank you', 'end of our meet', 'yeah']):
                filtered_sentences.append(sentence)
        
        # Take most informative sentences
        if filtered_sentences:
            # Sort by length and informativeness
            scored_sentences = []
            for sentence in filtered_sentences:
                score = len(sentence)  # Simple scoring by length
                if any(keyword in sentence.lower() for keyword in ['will', 'doing', 'responsible', 'assigned']):
                    score += 50  # Boost assignment-related sentences
                scored_sentences.append((score, sentence))
            
            scored_sentences.sort(reverse=True)
            
            # Take top sentences and format nicely
            selected = [sentence for score, sentence in scored_sentences[:3]]
            
            # Format as structured summary
            formatted_summary = "Meeting Summary:\n"
            for sentence in selected:
                formatted_summary += f"• {sentence}\n"
            
            return formatted_summary.strip()
        
        # Ultimate fallback
        return "Meeting Summary:\n• Meeting discussion took place with task assignments and coordination."
    
    def _split_text(self, text: str, max_length: int) -> List[str]:
        """Split text into chunks (kept for compatibility)"""
        words = text.split()
        chunks = []
        current_chunk = []
        current_length = 0
        
        for word in words:
            if current_length + len(word) + 1 <= max_length:
                current_chunk.append(word)
                current_length += len(word) + 1
            else:
                if current_chunk:
                    chunks.append(" ".join(current_chunk))
                current_chunk = [word]
                current_length = len(word)
        
        if current_chunk:
            chunks.append(" ".join(current_chunk))
        
        return chunks

# Global instance
summary_service = SummaryService()