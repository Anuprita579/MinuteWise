import spacy
import re
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class ActionItemService:
    def __init__(self):
        # Load spaCy model for NER and dependency parsing
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            logger.warning("Please install spaCy English model: python -m spacy download en_core_web_sm")
            self.nlp = None
        
        self.executor = ThreadPoolExecutor(max_workers=2)
        
        # Enhanced patterns for action item detection
        self.assignment_patterns = [
            # Direct assignment patterns: "Name will do X"
            r"(\w+)\s+(?:will|shall)\s+(?:be\s+)?(?:doing|do|handle|complete|finish|create|prepare|work on|take care of)\s+(?:the\s+)?(.+?)(?:\.|$|and|\,)",
            
            # Task assignment: "Name you will be doing X" - MOST IMPORTANT for your case
            r"(\w+)(?:\s+you)?\s+will\s+be\s+doing\s+(?:the\s+)?(.+?)(?:\s+and|$|\.|,)",
            
            # Alternative pattern for compound sentences
            r"(\w+)\s+you\s+will\s+be\s+doing\s+(?:the\s+)?(.+?)(?:\s+and\s+\w+\s+you\s+will\s+be\s+doing|$|\.|,)",
            
            # Responsibility assignment: "Name is responsible for X"
            r"(\w+)\s+(?:is|will be)\s+responsible\s+for\s+(?:the\s+)?(.+?)(?:\.|$|and|\,)",
            
            # Assignment with task: "assign X to Name" or "Name is assigned X"
            r"(?:assign|give)\s+(?:the\s+)?(.+?)\s+to\s+(\w+)(?:\.|$|and|\,)",
            r"(\w+)\s+(?:is|has been)\s+assigned\s+(?:to\s+)?(?:the\s+)?(.+?)(?:\.|$|and|\,)",
            
            # Direct task delegation: "Name to do X"
            r"(\w+)\s+to\s+(?:do|handle|complete|finish|create|prepare)\s+(?:the\s+)?(.+?)(?:\.|$|and|\,)",
        ]
        
        # Action verbs and keywords
        self.action_verbs = {
            'documentation': ['document', 'documenting', 'documentation', 'notes', 'recording'],
            'presentation': ['presentation', 'presenting', 'powerpoint', 'slides', 'demo'],
            'development': ['develop', 'developing', 'code', 'coding', 'build', 'building'],
            'research': ['research', 'researching', 'investigate', 'analysis', 'study'],
            'review': ['review', 'reviewing', 'check', 'checking', 'validate'],
            'follow_up': ['follow up', 'follow-up', 'contact', 'reach out', 'call'],
            'testing': ['test', 'testing', 'qa', 'quality assurance', 'verify']
        }
        
        # Priority keywords
        self.priority_keywords = {
            'high': ['urgent', 'critical', 'asap', 'immediately', 'priority', 'important'],
            'low': ['later', 'eventually', 'when possible', 'nice to have', 'if time permits'],
            'medium': []  # default
        }
    
    async def extract_action_items(self, transcript: str) -> List[Dict]:
        """Extract action items from transcript using enhanced NLP techniques"""
        loop = asyncio.get_event_loop()
        
        def _extract():
            try:
                # Clean and prepare text
                cleaned_text = self._clean_transcript(transcript)
                logger.info(f"Cleaned transcript: '{cleaned_text}'")
                
                # Split into sentences
                sentences = self._split_into_sentences(cleaned_text)
                logger.info(f"Split into sentences: {sentences}")
                
                action_items = []
                processed_assignments = set()  # Avoid duplicates
                
                for sentence in sentences:
                    logger.debug(f"Processing sentence: {sentence}")
                    
                    # Extract assignments from this sentence
                    assignments = self._extract_assignments_from_sentence(sentence)
                    logger.info(f"Found {len(assignments)} assignments in sentence: '{sentence}'")
                    
                    for assignment in assignments:
                        # Create unique key to avoid duplicates
                        key = f"{assignment['assignee']}-{assignment['text'][:20]}"
                        if key not in processed_assignments:
                            processed_assignments.add(key)
                            action_items.append(assignment)
                            logger.info(f"Added action item: {assignment}")
                
                # If no specific assignments found, look for general action items
                if not action_items:
                    logger.info("No specific assignments found, looking for general actions")
                    action_items = self._extract_general_actions(sentences)
                
                logger.info(f"Final result: Extracted {len(action_items)} action items")
                return action_items
                
            except Exception as e:
                logger.error(f"Action item extraction failed: {str(e)}")
                return []
        
        try:
            items = await loop.run_in_executor(self.executor, _extract)
            return items
        except Exception as e:
            logger.error(f"Async action item extraction failed: {str(e)}")
            return []
    
    def _clean_transcript(self, transcript: str) -> str:
        """Clean transcript for better processing"""
        # Remove extra whitespace and normalize
        cleaned = ' '.join(transcript.split())
        
        # Fix common transcription issues
        cleaned = re.sub(r'\b[Bb]ria\b', 'Ria', cleaned)  # Fix "Bria" -> "Ria"
        cleaned = re.sub(r'\bmeet\b', 'meeting', cleaned)  # Normalize "meet" -> "meeting"
        
        return cleaned
    
    def _split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences with better handling"""
        if self.nlp:
            doc = self.nlp(text)
            sentences = [sent.text.strip() for sent in doc.sents if sent.text.strip()]
        else:
            # Enhanced regex-based splitting
            sentences = re.split(r'[.!?]+\s+', text)
            sentences = [s.strip() for s in sentences if s.strip()]
        
        # Also split on "and" for compound assignments, but preserve context
        expanded_sentences = []
        for sentence in sentences:
            # For sentences with multiple assignments like "A will do X and B will do Y"
            if ' and ' in sentence and sentence.count('will be doing') > 1:
                # Split while preserving assignment structure
                parts = re.split(r'\s+and\s+(?=\w+\s+(?:you\s+)?will\s+be\s+doing)', sentence)
                expanded_sentences.extend([p.strip() for p in parts if p.strip()])
            else:
                expanded_sentences.append(sentence)
        
        logger.debug(f"Split sentences: {expanded_sentences}")
        return [s.strip() for s in expanded_sentences if s.strip()]

    
    def _extract_assignments_from_sentence(self, sentence: str) -> List[Dict]:
        """Extract specific assignments from a sentence"""
        assignments = []
        
        logger.info(f"Analyzing sentence: '{sentence}'")
        
        for i, pattern in enumerate(self.assignment_patterns):
            logger.debug(f"Testing pattern {i}: {pattern}")
            matches = re.finditer(pattern, sentence, re.IGNORECASE)
            
            for match in matches:
                groups = match.groups()
                logger.info(f"Pattern {i} matched groups: {groups}")
                
                if len(groups) >= 2:
                    # Determine which group is assignee and which is task
                    group1, group2 = groups[0].strip(), groups[1].strip()
                    
                    # Check if pattern has task first (like "assign X to Name")
                    if "assign" in pattern and "to" in pattern:
                        task, assignee = group1, group2
                    else:
                        assignee, task = group1, group2
                    
                    # Clean up assignee name
                    original_assignee = assignee
                    assignee = self._clean_assignee_name(assignee)
                    task = self._clean_task_description(task)
                    
                    logger.info(f"Extracted - Original assignee: '{original_assignee}', Clean assignee: '{assignee}', Task: '{task}'")
                    
                    if assignee and task and len(task) > 2:  # Reduced minimum task length
                        assignment = {
                            "text": task,
                            "assignee": assignee,
                            "priority": self._determine_priority(sentence),
                            "category": self._categorize_task(task),
                            "completed": False,
                            "source_sentence": sentence
                        }
                        assignments.append(assignment)
                        logger.info(f"Successfully created assignment: {assignee} -> {task}")
                    else:
                        logger.warning(f"Assignment filtered out - assignee: '{assignee}', task: '{task}' (length: {len(task) if task else 0})")
        
        logger.info(f"Total assignments found in sentence: {len(assignments)}")
        return assignments
    
    def _clean_assignee_name(self, name: str) -> Optional[str]:
        """Clean and validate assignee name"""
        if not name:
            return None
        
        # Remove common words that aren't names but be less aggressive
        name = re.sub(r'\b(you|will|be|doing|the|and|to|is|are|a|an)\b', '', name, flags=re.IGNORECASE).strip()
        
        # Capitalize first letter of each word (handle names like "Bria")
        name = ' '.join(word.capitalize() for word in name.split() if word)
        
        # Return None if name is too short or contains only common words
        if not name or len(name) < 2:
            return None
            
        # Don't filter out actual names - be more permissive
        common_pronouns = ['we', 'us', 'they', 'them', 'i', 'me', 'my', 'our']
        if name.lower() in common_pronouns:
            return None
        
        return name
    
    def _clean_task_description(self, task: str) -> str:
        """Clean task description"""
        if not task:
            return ""
        
        # Remove trailing words that aren't part of the task
        task = re.sub(r'\b(so|yeah|that|is|the|end|of|our|meeting?|thank|you)\b.*$', '', task, flags=re.IGNORECASE)
        
        # Clean up extra whitespace
        task = ' '.join(task.split()).strip()
        
        return task
    
    def _categorize_task(self, task: str) -> str:
        """Categorize the task based on keywords"""
        task_lower = task.lower()
        
        for category, keywords in self.action_verbs.items():
            if any(keyword in task_lower for keyword in keywords):
                return category.replace('_', ' ').title()
        
        return "General"
    
    def _determine_priority(self, sentence: str) -> str:
        """Determine priority based on keywords and context"""
        sentence_lower = sentence.lower()
        
        for priority, keywords in self.priority_keywords.items():
            if any(keyword in sentence_lower for keyword in keywords):
                return priority
        
        return "medium"  # default priority
    
    def _extract_general_actions(self, sentences: List[str]) -> List[Dict]:
        """Extract general action items when no specific assignments found"""
        actions = []
        
        action_keywords = ['will', 'should', 'need to', 'have to', 'must', 'going to']
        
        for sentence in sentences:
            sentence_lower = sentence.lower()
            if any(keyword in sentence_lower for keyword in action_keywords):
                # Skip very short or meeting-ending sentences
                if len(sentence) > 10 and not any(end_word in sentence_lower for end_word in ['end', 'thank', 'bye']):
                    actions.append({
                        "text": sentence.strip(),
                        "assignee": None,
                        "priority": self._determine_priority(sentence),
                        "category": "General",
                        "completed": False,
                        "source_sentence": sentence
                    })
        
        return actions

# Global instance
action_item_service = ActionItemService()