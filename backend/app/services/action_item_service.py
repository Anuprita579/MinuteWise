import spacy
import re
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Optional, Set, Tuple
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

class ActionItemService:
    def __init__(self):
        # Load spaCy model for advanced NLP
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            logger.warning("Please install spaCy English model: python -m spacy download en_core_web_sm")
            self.nlp = None
        
        self.executor = ThreadPoolExecutor(max_workers=2)
        
        # Comprehensive action verbs (industry-agnostic)
        self.action_verbs = {
            'create', 'make', 'build', 'develop', 'design', 'implement', 'write', 'draft',
            'complete', 'finish', 'finalize', 'prepare', 'setup', 'configure',
            'review', 'check', 'verify', 'validate', 'test', 'inspect', 'audit', 'analyze',
            'update', 'revise', 'modify', 'change', 'fix', 'repair', 'maintain', 'service',
            'install', 'deploy', 'launch', 'release', 'deliver', 'ship',
            'research', 'investigate', 'study', 'explore', 'examine',
            'document', 'record', 'log', 'report', 'summarize',
            'present', 'demo', 'showcase', 'demonstrate',
            'schedule', 'plan', 'organize', 'coordinate', 'arrange',
            'contact', 'call', 'email', 'reach out', 'follow up', 'notify',
            'approve', 'sign off', 'authorize', 'confirm',
            'train', 'teach', 'educate', 'mentor', 'guide',
            'collect', 'gather', 'compile', 'assemble',
            'process', 'handle', 'manage', 'oversee', 'monitor',
            'clean', 'clear', 'remove', 'delete', 'archive',
            'measure', 'calculate', 'estimate', 'assess', 'evaluate'
        }
        
        # Assignment signal words
        self.assignment_signals = {
            'direct': ['you will', 'you do', 'you should', 'you need to', 'you have to'],
            'passive': ['by', 'assigned to', 'handled by', 'done by'],
            'imperative': ['please', 'can you', 'could you', 'would you']
        }
        
        # Priority keywords
        self.priority_keywords = {
            'high': ['urgent', 'critical', 'asap', 'immediately', 'priority', 'important', 'emergency'],
            'low': ['later', 'eventually', 'when possible', 'nice to have', 'if time permits', 'optional'],
        }
        
        # Context stopwords for task cleaning
        self.task_stopwords = {
            'so', 'yeah', 'that', 'this', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
            'and', 'or', 'but', 'as', 'discussed', 'previous', 'meeting', 'also',
            'for', 'to', 'in', 'on', 'at', 'from', 'with', 'about', 'of'
        }
    
    async def extract_action_items(self, transcript: str) -> List[Dict]:
        """Extract action items using advanced NLP and feature engineering"""
        loop = asyncio.get_event_loop()
        
        def _extract():
            try:
                # Clean transcript
                cleaned_text = self._clean_transcript(transcript)
                logger.info(f"Cleaned transcript: '{cleaned_text}'")
                
                # Process with spaCy for linguistic features
                if not self.nlp:
                    return []
                
                doc = self.nlp(cleaned_text)
                
                # Extract person names
                person_names = self._extract_entities(doc)
                logger.info(f"Detected entities - Persons: {person_names}")
                
                # Split into sentences
                sentences = [sent for sent in doc.sents]
                logger.info(f"Processing {len(sentences)} sentences")
                
                action_items = []
                seen_items = set()
                
                for sent in sentences:
                    logger.info(f"Analyzing: '{sent.text}'")
                    
                    # Extract action items using multiple methods
                    items = self._extract_from_sentence(sent, person_names)
                    
                    for item in items:
                        # Create unique key
                        key = f"{item['assignee'].lower()}:{item['text'].lower()}"
                        
                        if key not in seen_items and len(item['text'].split()) <= 6:  # Max 6 words
                            seen_items.add(key)
                            action_items.append(item)
                            logger.info(f"✓ Extracted: {item['assignee'] or '[Unassigned]'} → {item['text']} (confidence: {item['confidence']:.2f})")
                
                # Sort by confidence and filter low-confidence items
                action_items = [item for item in action_items if item['confidence'] > 0.3]
                action_items.sort(key=lambda x: x['confidence'], reverse=True)
                
                logger.info(f"Final: {len(action_items)} action items extracted")
                return action_items
                
            except Exception as e:
                logger.error(f"Extraction failed: {str(e)}", exc_info=True)
                return []
        
        try:
            return await loop.run_in_executor(self.executor, _extract)
        except Exception as e:
            logger.error(f"Async extraction failed: {str(e)}")
            return []
    
    def _extract_entities(self, doc) -> Set[str]:
        """Extract person names using NER"""
        persons = set()
        for ent in doc.ents:
            if ent.label_ == "PERSON":
                persons.add(ent.text)
        
        # Additional pattern-based name detection
        for token in doc:
            if token.pos_ == "PROPN" and token.text[0].isupper():
                # Filter out common false positives
                if token.text not in {'Hi', 'Hello', 'Yes', 'Okay', 'Sir', 'Thank', 'We', 'So'}:
                    persons.add(token.text)
        
        return persons
    
    def _extract_from_sentence(self, sent, person_names: Set[str]) -> List[Dict]:
        """Extract action items from sentence using multiple methods"""
        items = []
        
        # Method 1: Pattern-based extraction
        items.extend(self._pattern_based_extraction(sent, person_names))
        
        # Method 2: Dependency parsing
        items.extend(self._dependency_based_extraction(sent, person_names))
        
        # Method 3: Verb-noun phrase extraction
        items.extend(self._verb_phrase_extraction(sent, person_names))
        
        return items
    
    def _pattern_based_extraction(self, sent, person_names: Set[str]) -> List[Dict]:
        """Extract using enhanced patterns with confidence scoring"""
        items = []
        text = sent.text
        
        patterns = [
            # "Name, you will be doing/working on X"
            (r'(\w+),\s+you\s+will\s+be\s+(?:doing|working on)\s+(?:the\s+)?(.+?)(?:\s+and|\.|\,|$)', 0.95),
            # "Name, you do/work on X"
            (r'(\w+),?\s+you\s+(?:do|work on)\s+(?:the\s+)?(.+?)(?:\s+and|\.|\,|$)', 0.90),
            # "X by Name"
            (r'(.+?)\s+by\s+(\w+)(?:\.|\,|$)', 0.85),
            # "Name will do/handle/work on X"
            (r'(\w+)\s+will\s+(?:do|handle|work on|complete|prepare)\s+(?:the\s+)?(.+?)(?:\.|\,|$)', 0.80),
            # "Name to do X"
            (r'(\w+)\s+to\s+(?:do|handle|work on)\s+(?:the\s+)?(.+?)(?:\.|\,|$)', 0.75),
        ]
        
        for pattern, base_confidence in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                groups = match.groups()
                if len(groups) >= 2:
                    # Determine assignee and task order
                    if 'by' in pattern:
                        task_raw, assignee_raw = groups[0], groups[1]
                    else:
                        assignee_raw, task_raw = groups[0], groups[1]
                    
                    assignee = self._clean_assignee(assignee_raw, person_names)
                    task = self._extract_concise_task(task_raw, sent)
                    
                    if task and self._is_valid_task(task):
                        confidence = self._calculate_confidence(sent, task, assignee, base_confidence)
                        items.append({
                            'text': task,
                            'assignee': assignee or '',
                            'priority': self._determine_priority(sent.text),
                            'category': self._categorize_task(task),
                            'completed': False,
                            'source_sentence': sent.text,
                            'confidence': confidence,
                            'extraction_method': 'pattern'
                        })
        
        return items
    
    def _dependency_based_extraction(self, sent, person_names: Set[str]) -> List[Dict]:
        """Extract using dependency parsing for better accuracy"""
        items = []
        
        # Find main verbs that are action verbs
        for token in sent:
            if token.pos_ == 'VERB' and token.lemma_ in self.action_verbs:
                # Find the subject (who)
                assignee = None
                for child in token.children:
                    if child.dep_ in ['nsubj', 'nsubjpass']:
                        if child.text in person_names:
                            assignee = child.text
                        break
                
                # Find the object (what)
                task_tokens = []
                for child in token.children:
                    if child.dep_ in ['dobj', 'pobj', 'attr']:
                        task_tokens.append(child.text)
                        # Get compound nouns
                        for subchild in child.subtree:
                            if subchild.dep_ in ['compound', 'amod'] and subchild.i < child.i:
                                task_tokens.insert(0, subchild.text)
                
                if task_tokens:
                    task = ' '.join([token.lemma_] + task_tokens)
                    task = self._clean_task_text(task)
                    
                    if self._is_valid_task(task):
                        confidence = self._calculate_confidence(sent, task, assignee, 0.70)
                        items.append({
                            'text': task,
                            'assignee': assignee or '',
                            'priority': self._determine_priority(sent.text),
                            'category': self._categorize_task(task),
                            'completed': False,
                            'source_sentence': sent.text,
                            'confidence': confidence,
                            'extraction_method': 'dependency'
                        })
        
        return items
    
    def _verb_phrase_extraction(self, sent, person_names: Set[str]) -> List[Dict]:
        """Extract verb phrases as potential action items"""
        items = []
        
        # Look for noun chunks preceded by action verbs
        for chunk in sent.noun_chunks:
            # Check if there's an action verb before this chunk
            verb_token = None
            for token in sent:
                if token.pos_ == 'VERB' and token.lemma_ in self.action_verbs:
                    if token.i < chunk.start and chunk.start - token.i <= 3:
                        verb_token = token
                        break
            
            if verb_token:
                # Check for assignee (person name before verb)
                assignee = None
                for token in sent:
                    if token.text in person_names and token.i < verb_token.i:
                        assignee = token.text
                        break
                
                task = f"{verb_token.lemma_} {chunk.text}"
                task = self._clean_task_text(task)
                
                if self._is_valid_task(task) and len(task.split()) <= 4:
                    confidence = self._calculate_confidence(sent, task, assignee, 0.60)
                    items.append({
                        'text': task,
                        'assignee': assignee or '',
                        'priority': self._determine_priority(sent.text),
                        'category': self._categorize_task(task),
                        'completed': False,
                        'source_sentence': sent.text,
                        'confidence': confidence,
                        'extraction_method': 'verb_phrase'
                    })
        
        return items
    
    def _extract_concise_task(self, task_text: str, sent) -> str:
        """Extract concise 2-4 word task description using NLP"""
        if not task_text:
            return ""
        
        # Parse the task text
        task_doc = self.nlp(task_text.strip())
        
        # Strategy 1: Get verb + main noun phrase
        main_tokens = []
        seen_lemmas = set()  # Track lemmas to avoid duplicates
        found_verb = False
        
        for token in task_doc:
            # Skip stopwords at the start
            if not main_tokens and token.text.lower() in self.task_stopwords:
                continue
            
            # Skip if we've already seen this lemma (avoid "documentation documentation")
            if token.lemma_.lower() in seen_lemmas:
                continue
            
            # Collect action verb
            if token.pos_ == 'VERB' and token.lemma_ in self.action_verbs:
                main_tokens.append(token.lemma_)
                seen_lemmas.add(token.lemma_.lower())
                found_verb = True
            # Collect main nouns and their modifiers
            elif token.pos_ in ['NOUN', 'PROPN']:
                # Get compound and modifiers
                for child in token.children:
                    if child.dep_ in ['compound', 'amod'] and child.lemma_.lower() not in seen_lemmas:
                        main_tokens.append(child.text)
                        seen_lemmas.add(child.lemma_.lower())
                
                if token.lemma_.lower() not in seen_lemmas:
                    main_tokens.append(token.text)
                    seen_lemmas.add(token.lemma_.lower())
            # Include important adjectives
            elif token.pos_ == 'ADJ' and token.head.pos_ == 'NOUN' and token.lemma_.lower() not in seen_lemmas:
                main_tokens.append(token.text)
                seen_lemmas.add(token.lemma_.lower())
            
            # Stop if we have enough tokens
            if len(main_tokens) >= 4:
                break
        
        # Strategy 2: If no good tokens, extract noun chunks
        if len(main_tokens) < 2:
            for chunk in task_doc.noun_chunks:
                words = chunk.text.split()
                for word in words[:3]:
                    lemma = self.nlp(word)[0].lemma_.lower()
                    if lemma not in seen_lemmas:
                        main_tokens.append(word)
                        seen_lemmas.add(lemma)
                if len(main_tokens) >= 3:
                    break
        
        task = ' '.join(main_tokens[:4])  # Max 4 words
        return self._clean_task_text(task)
    
    def _clean_task_text(self, task: str) -> str:
        """Clean and normalize task text"""
        if not task:
            return ""
        
        # Remove extra whitespace
        task = ' '.join(task.split())
        
        # Split into words and remove duplicates while preserving order
        words = task.split()
        seen = set()
        unique_words = []
        
        for word in words:
            word_lower = word.lower()
            # Skip stopwords at beginning/end positions
            if not unique_words and word_lower in self.task_stopwords:
                continue
            # Skip duplicate words (case-insensitive)
            if word_lower not in seen:
                seen.add(word_lower)
                unique_words.append(word)
        
        # Remove trailing stopwords
        while unique_words and unique_words[-1].lower() in self.task_stopwords:
            unique_words.pop()
        
        if not unique_words:
            return ""
        
        task = ' '.join(unique_words)
        
        # Remove phrases that indicate it's not a real task
        invalid_phrases = ['that work', 'this work', 'it', 'them', 'that', 'this', 'next next week', 'last last time']
        if task.lower() in invalid_phrases:
            return ""
        
        # Remove duplicate consecutive words like "next next"
        task = re.sub(r'\b(\w+)\s+\1\b', r'\1', task, flags=re.IGNORECASE)
        
        # Capitalize properly
        words = task.split()
        if words:
            words[0] = words[0].capitalize()
            # Keep proper nouns capitalized
            for i in range(1, len(words)):
                if words[i][0].isupper():
                    continue
                else:
                    words[i] = words[i].lower()
        
        return ' '.join(words)
    
    def _calculate_confidence(self, sent, task: str, assignee: Optional[str], base_confidence: float) -> float:
        """Calculate confidence score using multiple features"""
        confidence = base_confidence
        
        # Feature 1: Has assignee (+0.1)
        if assignee:
            confidence += 0.1
        
        # Feature 2: Task contains action verb (+0.05)
        task_lower = task.lower()
        if any(verb in task_lower for verb in self.action_verbs):
            confidence += 0.05
        
        # Feature 3: Sentence contains assignment signals (+0.05)
        sent_lower = sent.text.lower()
        for signal_type, signals in self.assignment_signals.items():
            if any(signal in sent_lower for signal in signals):
                confidence += 0.05
                break
        
        # Feature 4: Task length is optimal (2-4 words) (+0.05)
        word_count = len(task.split())
        if 2 <= word_count <= 4:
            confidence += 0.05
        elif word_count == 1:
            confidence -= 0.1
        
        # Feature 5: No question marks (-0.2)
        if '?' in sent.text:
            confidence -= 0.2
        
        # Feature 6: Sentence position (later in doc = higher confidence)
        # (Would need full doc context, skipping for now)
        
        return min(1.0, max(0.0, confidence))
    
    def _is_valid_task(self, task: str) -> bool:
        """Validate if task is meaningful"""
        if not task or len(task) < 3:
            return False
        
        words = task.lower().split()
        
        # Must have at least one meaningful word
        meaningful_words = [w for w in words if w not in self.task_stopwords and len(w) > 2]
        if len(meaningful_words) < 1:
            return False
        
        # Check for invalid patterns
        invalid_patterns = [
            'work till', 'that work', 'this work', 'and prepare',
            'next next', 'last last', 'did last', 'work next'
        ]
        task_lower = task.lower()
        if any(inv in task_lower for inv in invalid_patterns):
            return False
        
        # Don't allow single-word tasks unless they're very specific
        if len(words) == 1 and words[0].lower() not in ['documentation', 'report', 'presentation', 'dashboard', 'testing']:
            return False
        
        return True
    
    def _clean_assignee(self, name: str, person_names: Set[str]) -> Optional[str]:
        """Clean and validate assignee name"""
        if not name:
            return None
        
        # Match against known person names
        for person in person_names:
            if person.lower() in name.lower():
                return person
        
        # Clean common words
        cleaned = re.sub(
            r'\b(you|will|be|doing|the|and|to|is|are|a|an|have|has|we|need|must|should|by|for|working|on)\b',
            '', name, flags=re.IGNORECASE
        ).strip()
        
        cleaned = ' '.join(w.capitalize() for w in cleaned.split())
        
        if not cleaned or len(cleaned) < 2:
            return None
        
        # Filter pronouns
        if cleaned.lower() in ['we', 'us', 'they', 'them', 'i', 'me', 'you']:
            return None
        
        return cleaned
    
    def _categorize_task(self, task: str) -> str:
        """Categorize task based on content"""
        task_lower = task.lower()
        
        categories = {
            'Documentation': ['document', 'documentation', 'notes', 'record'],
            'Presentation': ['presentation', 'present', 'powerpoint', 'slides', 'demo'],
            'Development': ['develop', 'build', 'code', 'implement', 'create'],
            'Testing': ['test', 'verify', 'validate', 'check', 'qa'],
            'Maintenance': ['repair', 'fix', 'maintain', 'service', 'clean'],
            'Research': ['research', 'investigate', 'study', 'analyze'],
            'Planning': ['plan', 'schedule', 'organize', 'prepare'],
            'Reporting': ['report', 'summary', 'dashboard', 'metrics', 'chart'],
            'Communication': ['contact', 'email', 'call', 'notify', 'follow up'],
        }
        
        for category, keywords in categories.items():
            if any(kw in task_lower for kw in keywords):
                return category
        
        return "General"
    
    def _determine_priority(self, text: str) -> str:
        """Determine priority from context"""
        text_lower = text.lower()
        
        for priority, keywords in self.priority_keywords.items():
            if any(kw in text_lower for kw in keywords):
                return priority
        
        return "medium"
    
    def _clean_transcript(self, transcript: str) -> str:
        """Clean transcript"""
        cleaned = ' '.join(transcript.split())
        cleaned = re.sub(r'\bmeet\b', 'meeting', cleaned, flags=re.IGNORECASE)
        return cleaned

# Global instance
action_item_service = ActionItemService()