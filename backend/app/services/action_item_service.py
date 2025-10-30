import re
import json
from typing import List, Dict, Optional
from difflib import SequenceMatcher
import logging
import os
import google.generativeai as genai
import asyncio
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)


class ActionItemService:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=2)
        
        # Initialize Gemini
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        self.use_gemini = bool(self.gemini_api_key)
        
        if self.use_gemini:
            try:
                genai.configure(api_key=self.gemini_api_key)
                self.model = genai.GenerativeModel('gemini-pro')
                logger.info("Gemini API initialized for action item extraction")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini: {e}")
                self.use_gemini = False
        else:
            logger.warning("Gemini API key not found, using rule-based extraction")
        
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
        """Extract action items from transcript using Gemini or fallback to rule-based"""
        if not transcript:
            return []
        
        participant_map = self._build_participant_map(participants)
        
        # Try Gemini first if available
        if self.use_gemini:
            try:
                action_items = self._extract_with_gemini(transcript, participants, participant_map)
                if action_items:
                    logger.info(f"Successfully extracted {len(action_items)} action items with Gemini")
                    return action_items
            except Exception as e:
                logger.error(f"Gemini extraction failed: {e}, falling back to rule-based")
        
        # Fallback to rule-based extraction
        action_items = self._extract_with_patterns(transcript, participant_map)
        return action_items

    def _extract_with_gemini(self, transcript: str, participants: List[Dict], participant_map: Dict) -> List[Dict]:
        """Extract action items using Gemini API"""
        
        # Prepare participant list for the prompt
        participant_list = "\n".join([f"- {p['name']} ({p.get('email', 'N/A')})" for p in participants])
        
        prompt = f"""You are analyzing a meeting transcript to extract action items. Be precise and only extract clear, actionable tasks.

**Meeting Participants:**
{participant_list}

**Instructions:**
1. Extract ONLY explicit action items where someone is assigned a specific task
2. Each action item must have:
   - A clear assignee (must be one of the participants listed above)
   - A specific, actionable task description
   - Appropriate priority (low, medium, or high)
   - Relevant category
3. DO NOT extract:
   - General discussion points
   - Questions without clear action
   - Vague statements
4. Use ONLY the participant names listed above
5. Return valid JSON array format

**Categories:** Documentation, Presentation, Development, Review, Communication, Planning, Testing, Deployment, Healthcare, General

**Transcript:**
{transcript}

**Required JSON Format:**
[
  {{
    "assignee": "Full Name from participant list",
    "text": "Clear task description",
    "priority": "low|medium|high",
    "category": "Category from list above"
  }}
]

Return ONLY the JSON array, no additional text."""

        try:
            response = self.model.generate_content(prompt)
            response_text = response.text.strip()
            
            # Extract JSON from response (handle markdown code blocks)
            if "```json" in response_text:
                json_match = re.search(r'```json\s*(\[.*?\])\s*```', response_text, re.DOTALL)
                if json_match:
                    response_text = json_match.group(1)
            elif "```" in response_text:
                json_match = re.search(r'```\s*(\[.*?\])\s*```', response_text, re.DOTALL)
                if json_match:
                    response_text = json_match.group(1)
            
            # Parse JSON
            extracted_items = json.loads(response_text)
            
            # Validate and enhance with participant details
            validated_items = []
            for item in extracted_items:
                if not isinstance(item, dict):
                    continue
                
                assignee_name = item.get('assignee', '').strip()
                task_text = item.get('text', '').strip()
                
                if not assignee_name or not task_text or len(task_text) < 3:
                    continue
                
                # Match participant
                matched = self._match_participant(assignee_name, participant_map)
                if not matched:
                    logger.warning(f"Could not match participant: {assignee_name}")
                    continue
                
                # Validate task doesn't contain other names
                if self._contains_other_names(task_text, matched, participant_map):
                    logger.info(f"Skipping - task contains other participant name: {task_text[:50]}")
                    continue
                
                # Create action item
                validated_item = {
                    'text': task_text,
                    'assignee': matched['name'],
                    'assignee_email': matched.get('email', ''),
                    'priority': item.get('priority', 'medium').lower(),
                    'category': item.get('category', 'General'),
                    'status': 'pending',
                    'completed': False,
                    'confidence': 0.95,  # High confidence for Gemini extractions
                    'extraction_method': 'gemini'
                }
                
                # Validate priority
                if validated_item['priority'] not in ['low', 'medium', 'high']:
                    validated_item['priority'] = 'medium'
                
                # Check for duplicates
                if not self._is_duplicate(validated_item['text'], validated_item['assignee'], validated_items):
                    validated_items.append(validated_item)
                    logger.info(f"✓ Gemini: {validated_item['assignee']} → {validated_item['text'][:50]}")
            
            return validated_items
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini JSON response: {e}")
            logger.error(f"Response was: {response_text[:200]}")
            return None
        except Exception as e:
            logger.error(f"Gemini extraction error: {e}")
            return None

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
        """Extract action items using pattern matching (fallback method)"""
        action_items = []
        seen_items = set()
        
        patterns = [
            (r'^(\w+(?:\s+\w+)?),\s+you\s+will\s+(?:be\s+)?(?:handle|do|doing|working on)\s+(?:the\s+)?(.+?)(?:\s+and\s+\w+|\.|$)', 0.99),
            (r'^(\w+(?:\s+\w+)?)\s+will\s+(?:handle|do|be doing)\s+(?:the\s+)?(.+?)(?:\s+and\s+\w+(?:\s+\w+)?(?:\s+will|\s+needs)|\.|$)', 0.98),
            (r'^(\w+(?:\s+\w+)?),\s+you\s+(?:need|should)\s+(?:to\s+)?(.+?)(?:\s+and\s+\w+|\.|$)', 0.98),
            (r'^(\w+(?:\s+\w+)?),\s+can\s+you\s+(?:please\s+)?(.+?)(?:\s+and\s+\w+|\?|$)', 0.97),
            (r'^(\w+(?:\s+\w+)?)\s+will\s+be\s+working\s+on\s+(?:the\s+)?(.+?)(?:\s+and\s+\w+|\.|$)', 0.97),
            (r'^(\w+(?:\s+\w+)?)\s+will\s+(?:handle|create|manage|update|finalize|coordinate|organize|prepare|review|send|submit|deliver|check|verify|document|write|research|develop|build|design|test|schedule|contact|do|make|implement|complete|process|analyze)(?:\s+(?:the|a)\s+)?(.+?)(?:\s+and\s+\w+(?:\s+\w+)?(?:\s+will)|\.|$)', 0.96),
            (r'^(\w+(?:\s+\w+)?)\s+needs?\s+to\s+(?:be\s+)?(?:do\s+)?(?:the\s+)?(.+?)(?:\s+and\s+\w+|\.|$)', 0.95),
            (r'^(\w+(?:\s+\w+)?)\s+should\s+(?:be\s+)?(.+?)(?:\s+and\s+\w+|\.|$)', 0.94),
        ]
        
        sentences = self._smart_sentence_split(transcript)
        logger.info(f"Processing {len(sentences)} sentences with rule-based extraction")
        
        for sent in sentences:
            if any(skip in sent.lower() for skip in ['hello', 'thank you', 'end of', 'starting', 'yeah', 'alright team', 'let\'s go']):
                continue
            
            for pattern, confidence in patterns:
                matches = re.finditer(pattern, sent, re.IGNORECASE)
                
                for match in matches:
                    groups = match.groups()
                    
                    if len(groups) < 2:
                        continue
                    
                    assignee_name = groups[0].strip()
                    task = groups[1].strip()
                    
                    task = self._clean_task(task, participant_map)
                    
                    if not task or len(task) < 3:
                        continue
                    
                    matched = self._match_participant(assignee_name, participant_map)
                    if not matched:
                        continue
                    
                    if self._contains_other_names(task, matched, participant_map):
                        continue
                    
                    category = self._categorize_task(task)
                    item_key = f"{matched['name'].lower()}:{task.lower()[:50]}"
                    
                    if item_key in seen_items:
                        continue
                    
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
                        'confidence': confidence,
                        'extraction_method': 'rule_based'
                    })
                    
                    logger.info(f"✓ Pattern: {matched['name']} → {task[:50]}")
        
        action_items.sort(key=lambda x: x['confidence'], reverse=True)
        return action_items

    def _smart_sentence_split(self, transcript: str) -> List[str]:
        """Split transcript intelligently"""
        sentences = re.split(r'[.!?]+\s+', transcript)
        processed = []
        
        for sent in sentences:
            sent = sent.strip()
            if not sent:
                continue
            
            and_name_pattern = r'\s+and\s+(\w+(?:\s+\w+)?)[,\s]+(?:you\s+)?(?:will|needs|should)'
            matches = list(re.finditer(and_name_pattern, sent, re.IGNORECASE))
            
            if len(matches) >= 1:
                first_match_start = matches[0].start()
                if first_match_start > 0:
                    first_part = sent[:first_match_start].strip()
                    if first_part:
                        processed.append(first_part)
                
                for i, match in enumerate(matches):
                    start = match.start()
                    if i + 1 < len(matches):
                        end = matches[i + 1].start()
                    else:
                        end = len(sent)
                    
                    section = sent[start:end].strip()
                    section = re.sub(r'^and\s+', '', section, flags=re.IGNORECASE).strip()
                    
                    if section:
                        processed.append(section)
            else:
                processed.append(sent)
        
        return [s for s in processed if len(s.strip()) > 5]

    def _clean_task(self, task: str, participant_map: Dict) -> str:
        """Clean task text"""
        task = re.sub(r'^(and|so|or|then|also)\s+', '', task, flags=re.IGNORECASE)
        task = re.sub(r'\s+(and|so|or|then)\s*$', '', task, flags=re.IGNORECASE)
        task = re.sub(r'\s+and\s+\w+(?:\s+\w+)?(?:\s+will|\s+needs|\s+should).*$', '', task, flags=re.IGNORECASE)
        task = re.sub(r'[.,;:!?]+$', '', task).strip()
        return task

    def _contains_other_names(self, task: str, matched_participant: Dict, participant_map: Dict) -> bool:
        """Check if task contains other participant names"""
        task_lower = task.lower()
        matched_name_lower = matched_participant['name'].lower()
        
        for pname in participant_map['all_names']:
            if pname == matched_name_lower:
                continue
            
            if pname in task_lower:
                return True
            
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
        name_clean = re.sub(r'^(dr\.|nurse|mr\.|ms\.|mrs\.)\s+', '', name_lower)
        
        if name_clean in participant_map['by_full_name']:
            return participant_map['by_full_name'][name_clean]
        
        if name_clean in participant_map['by_first_name']:
            return participant_map['by_first_name'][name_clean]
        
        if name_clean in participant_map['by_last_name']:
            return participant_map['by_last_name'][name_clean]
        
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