import re
from typing import List, Dict, Optional
from difflib import SequenceMatcher
import logging

logger = logging.getLogger(__name__)


class ActionItemService:
    def __init__(self):
        self.action_verbs = {
            'doing', 'create', 'handle', 'update', 'review', 'manage', 'prepare',
            'finalize', 'coordinate', 'organize', 'send', 'submit', 'deliver',
            'working', 'develop', 'build', 'design', 'test', 'document', 'write',
            'do', 'make', 'implement', 'complete', 'process', 'analyze', 'check'
        }

    def extract_action_items_with_participants(
        self, 
        transcript: str, 
        participants: List[Dict]
    ) -> List[Dict]:
        """Extract action items from transcript"""
        if not transcript:
            return []
        
        participant_map = self._build_participant_map(participants)
        action_items = self._extract_with_patterns(transcript, participant_map)
        
        return action_items

    def _build_participant_map(self, participants: List[Dict]) -> Dict:
        """Build participant lookup map"""
        participant_map = {
            'by_full_name': {},
            'by_first_name': {},
            'by_last_name': {},
            'all_names': [],
            'all_participants': participants
        }
        
        for p in participants:
            name = p['name'].strip()
            name_lower = name.lower()
            
            participant_map['by_full_name'][name_lower] = p
            participant_map['all_names'].append(name_lower)
            
            name_parts = name.split()
            if name_parts:
                first_name = name_parts[0].lower()
                participant_map['by_first_name'][first_name] = p
                
                if len(name_parts) > 1:
                    last_name = name_parts[-1].lower()
                    participant_map['by_last_name'][last_name] = p
        
        return participant_map

    def _extract_with_patterns(self, transcript: str, participant_map: Dict) -> List[Dict]:
        """Extract action items using pattern matching"""
        action_items = []
        seen_items = set()
        
        # Enhanced patterns with better handling of "and" connectors
        patterns = [
            # "Name, you will handle/do/be doing X" - for first person in sentence and split sections
            (r'^(\w+(?:\s+\w+)?),\s+you\s+will\s+(?:be\s+)?(?:handle|do|doing|working on)\s+(?:the\s+)?(.+?)(?:\s+and\s+\w+|\.|$)', 0.99),
            
            # "Name will handle/do X" - with strict boundary
            (r'^(\w+(?:\s+\w+)?)\s+will\s+(?:handle|do|be doing)\s+(?:the\s+)?(.+?)(?:\s+and\s+\w+(?:\s+\w+)?(?:\s+will|\s+needs)|\.|$)', 0.98),
            
            # "Name, you need/should X"
            (r'^(\w+(?:\s+\w+)?),\s+you\s+(?:need|should)\s+(?:to\s+)?(.+?)(?:\s+and\s+\w+|\.|$)', 0.98),
            
            # "Name, can you please X"
            (r'^(\w+(?:\s+\w+)?),\s+can\s+you\s+(?:please\s+)?(.+?)(?:\s+and\s+\w+|\?|$)', 0.97),
            
            # "Name will be working on X"
            (r'^(\w+(?:\s+\w+)?)\s+will\s+be\s+working\s+on\s+(?:the\s+)?(.+?)(?:\s+and\s+\w+|\.|$)', 0.97),
            
            # "Name will VERB X" - comprehensive verb list
            (r'^(\w+(?:\s+\w+)?)\s+will\s+(?:handle|create|manage|update|finalize|coordinate|organize|prepare|review|send|submit|deliver|check|verify|document|write|research|develop|build|design|test|schedule|contact|do|make|implement|complete|process|analyze)(?:\s+(?:the|a)\s+)?(.+?)(?:\s+and\s+\w+(?:\s+\w+)?(?:\s+will)|\.|$)', 0.96),
            
            # "Name needs to X"
            (r'^(\w+(?:\s+\w+)?)\s+needs?\s+to\s+(?:be\s+)?(?:do\s+)?(?:the\s+)?(.+?)(?:\s+and\s+\w+|\.|$)', 0.95),
            
            # "Name should X"
            (r'^(\w+(?:\s+\w+)?)\s+should\s+(?:be\s+)?(.+?)(?:\s+and\s+\w+|\.|$)', 0.94),
        ]
        
        # Split transcript into processable chunks
        # First, handle sentences that contain multiple assignments with "and"
        sentences = self._smart_sentence_split(transcript)
        
        logger.info(f"Processing {len(sentences)} sentences")
        
        for sent in sentences:
            # Skip noise
            if any(skip in sent.lower() for skip in ['hello', 'thank you', 'end of', 'starting', 'yeah', 'alright team', 'let\'s go']):
                continue
            
            # Try each pattern
            for pattern, confidence in patterns:
                matches = re.finditer(pattern, sent, re.IGNORECASE)
                
                for match in matches:
                    groups = match.groups()
                    
                    if len(groups) < 2:
                        continue
                    
                    assignee_name = groups[0].strip()
                    task = groups[1].strip()
                    
                    # Clean task
                    task = self._clean_task(task, participant_map)
                    
                    # Validate task
                    if not task or len(task) < 3:
                        continue
                    
                    # Match participant
                    matched = self._match_participant(assignee_name, participant_map)
                    if not matched:
                        continue
                    
                    # Validate task doesn't contain other names
                    if self._contains_other_names(task, matched, participant_map):
                        logger.info(f"Skipping - task contains other participant name: {task[:50]}")
                        continue
                    
                    # Categorize
                    category = self._categorize_task(task)
                    
                    # Create item key for dedup
                    item_key = f"{matched['name'].lower()}:{task.lower()[:50]}"
                    
                    # Skip if already added (exact match)
                    if item_key in seen_items:
                        continue
                    
                    # Check for very similar items (98%+)
                    if self._is_duplicate(task, matched['name'], action_items):
                        continue
                    
                    seen_items.add(item_key)
                    
                    action_items.append({
                        'text': task,
                        'assignee': matched['name'],
                        'assignee_email': matched.get('email', ''),
                        'priority': 'medium',
                        'category': category,
                        'status': 'pending',
                        'completed': False,
                        'confidence': confidence
                    })
                    
                    logger.info(f"✓ {matched['name']} → {task[:50]}")
        
        # Sort by confidence
        action_items.sort(key=lambda x: x['confidence'], reverse=True)
        
        return action_items

    def _smart_sentence_split(self, transcript: str) -> List[str]:
        """Split transcript intelligently, preserving 'and Name' patterns"""
        
        # First split on clear sentence boundaries
        sentences = re.split(r'[.!?]+\s+', transcript)
        
        processed = []
        for sent in sentences:
            sent = sent.strip()
            if not sent:
                continue
            
            # Check if sentence contains multiple "and Name," patterns
            # This indicates chained assignments in one sentence
            # Pattern matches: "and Name, you will" or "and Name will" or "and Name needs"
            and_name_pattern = r'\s+and\s+(\w+(?:\s+\w+)?)[,\s]+(?:you\s+)?(?:will|needs|should)'
            matches = list(re.finditer(and_name_pattern, sent, re.IGNORECASE))
            
            if len(matches) >= 1:
                logger.info(f"Found {len(matches)} 'and Name' patterns in: {sent[:80]}...")
                
                # Split the sentence at each "and Name," creating separate mini-sentences
                # We'll create one sentence per assignment
                split_pattern = r'(\s+and\s+\w+(?:\s+\w+)?[,\s]+(?:you\s+)?(?:will|needs|should)[^.]*?)(?=\s+and\s+\w+(?:\s+\w+)?[,\s]+(?:you\s+)?(?:will|needs|should)|$)'
                
                # First, get the part before the first "and Name"
                first_match_start = matches[0].start()
                if first_match_start > 0:
                    first_part = sent[:first_match_start].strip()
                    if first_part:
                        processed.append(first_part)
                        logger.info(f"  Split part 1: {first_part[:60]}...")
                
                # Now process each "and Name" section
                for i, match in enumerate(matches):
                    start = match.start()
                    # Find where this section ends (either at next "and Name" or end of sentence)
                    if i + 1 < len(matches):
                        end = matches[i + 1].start()
                    else:
                        end = len(sent)
                    
                    section = sent[start:end].strip()
                    # Remove leading "and" and clean up
                    section = re.sub(r'^and\s+', '', section, flags=re.IGNORECASE).strip()
                    
                    if section:
                        processed.append(section)
                        logger.info(f"  Split part {i+2}: {section[:60]}...")
            else:
                processed.append(sent)
        
        return [s for s in processed if len(s.strip()) > 5]

    def _clean_task(self, task: str, participant_map: Dict) -> str:
        """Clean task text"""
        # Remove leading conjunctions
        task = re.sub(r'^(and|so|or|then|also)\s+', '', task, flags=re.IGNORECASE)
        
        # Remove trailing conjunctions
        task = re.sub(r'\s+(and|so|or|then)\s*$', '', task, flags=re.IGNORECASE)
        
        # Remove "and Name will/needs/should" at the end
        task = re.sub(r'\s+and\s+\w+(?:\s+\w+)?(?:\s+will|\s+needs|\s+should).*$', '', task, flags=re.IGNORECASE)
        
        # Remove punctuation at the end
        task = re.sub(r'[.,;:!?]+$', '', task).strip()
        
        return task

    def _contains_other_names(self, task: str, matched_participant: Dict, participant_map: Dict) -> bool:
        """Check if task contains other participant names"""
        task_lower = task.lower()
        matched_name_lower = matched_participant['name'].lower()
        
        for pname in participant_map['all_names']:
            if pname == matched_name_lower:
                continue
            
            # Check full name and first name
            if pname in task_lower:
                return True
            
            # Check first name separately
            first_name = pname.split()[0]
            if first_name in task_lower.split():
                return True
        
        return False

    def _is_duplicate(self, task: str, assignee: str, action_items: List[Dict]) -> bool:
        """Check if this is a duplicate action item"""
        for existing in action_items:
            if existing['assignee'].lower() == assignee.lower():
                sim = SequenceMatcher(None, task.lower(), existing['text'].lower()).ratio()
                if sim > 0.98:
                    return True
        return False

    def _match_participant(self, name_mention: str, participant_map: Dict) -> Optional[Dict]:
        """Match name to participant"""
        name_lower = name_mention.lower().strip()
        
        # Remove titles
        name_clean = re.sub(r'^(dr\.|nurse|mr\.|ms\.|mrs\.)\s+', '', name_lower)
        
        # Direct matches
        if name_clean in participant_map['by_full_name']:
            return participant_map['by_full_name'][name_clean]
        
        if name_clean in participant_map['by_first_name']:
            return participant_map['by_first_name'][name_clean]
        
        if name_clean in participant_map['by_last_name']:
            return participant_map['by_last_name'][name_clean]
        
        # Fuzzy matching
        best_match = None
        best_score = 0.0
        
        for pname in participant_map['all_names']:
            score = SequenceMatcher(None, name_clean, pname).ratio()
            if score > best_score:
                best_score = score
                best_match = participant_map['by_full_name'][pname]
        
        if best_score >= 0.65:
            return best_match
        
        return None

    def _categorize_task(self, task: str) -> str:
        """Categorize task"""
        task_lower = task.lower()
        
        categories = {
            'Documentation': ['document', 'write', 'record', 'notes', 'paper', 'report', 'bibliography', 'research', 'records', 'medical records'],
            'Presentation': ['presentation', 'present', 'slides', 'ppt', 'powerpoint', 'power point'],
            'Development': ['develop', 'build', 'code', 'implement', 'create', 'design', 'mockup', 'frontend', 'backend'],
            'Review': ['review', 'check', 'verify', 'validate', 'evaluate', 'audit', 'changes', 'lab results'],
            'Communication': ['send', 'email', 'contact', 'call', 'outreach', 'media', 'relations', 'notify'],
            'Planning': ['plan', 'schedule', 'organize', 'prepare', 'coordinate', 'discussion', 'fundraising', 'chapters', 'events', 'group'],
            'Testing': ['test', 'qa', 'debug', 'quality', 'testing'],
            'Deployment': ['deploy', 'deployment', 'release'],
            'Healthcare': ['patient', 'medical', 'lab', 'pharmacy', 'evaluation', 'rounds', 'results'],
        }
        
        for category, keywords in categories.items():
            if any(kw in task_lower for kw in keywords):
                return category
        
        return 'General'


action_item_service = ActionItemService()