import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Dict
import logging
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Email Configuration
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_EMAIL = os.getenv("SMTP_EMAIL")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
APP_URL = os.getenv("APP_URL", "http://localhost:3000")


class EmailService:
    def __init__(self):
        if not SMTP_EMAIL or not SMTP_PASSWORD:
            logger.warning("SMTP credentials not configured")
            self.configured = False
        else:
            self.configured = True
            logger.info(f"Email service initialized with {SMTP_EMAIL}")

    def send_email(self, to_email: str, subject: str, html_body: str, text_body: str = None):
        """Send email using SMTP"""
        if not self.configured:
            raise Exception("Email service not configured. Set SMTP_EMAIL and SMTP_PASSWORD in .env")
        
        msg = MIMEMultipart('alternative')
        msg['From'] = SMTP_EMAIL
        msg['To'] = to_email
        msg['Subject'] = subject
        
        # Add text and HTML versions
        if text_body:
            msg.attach(MIMEText(text_body, 'plain'))
        msg.attach(MIMEText(html_body, 'html'))
        
        try:
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_EMAIL, SMTP_PASSWORD)
                server.send_message(msg)
                logger.info(f"Email sent successfully to {to_email}")
                return True
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            raise Exception(f"Failed to send email: {str(e)}")

    def send_action_items_email(self, to_email: str, meeting_title: str, action_items: List[Dict]):
        """Send email with assigned action items"""
        
        # Filter action items for this recipient
        recipient_items = [
            item for item in action_items 
            if item.get('assignee_email', '').lower() == to_email.lower()
        ]
        
        if not recipient_items:
            logger.warning(f"No action items for {to_email}")
            return False
        
        assignee_name = recipient_items[0].get('assignee', 'there')
        
        # Generate HTML
        html = self._generate_action_items_html(
            assignee_name=assignee_name,
            meeting_title=meeting_title,
            action_items=recipient_items
        )
        
        # Generate plain text
        text = self._generate_action_items_text(
            assignee_name=assignee_name,
            meeting_title=meeting_title,
            action_items=recipient_items
        )
        
        subject = f"Action Items Assigned: {meeting_title}"
        
        return self.send_email(to_email, subject, html, text)

    def send_meeting_summary_email(self, to_emails: List[str], meeting_title: str, 
                                   summary: str, action_items: List[Dict]):
        """Send meeting summary to multiple recipients"""
        
        html = self._generate_summary_html(meeting_title, summary, action_items)
        text = self._generate_summary_text(meeting_title, summary, action_items)
        
        subject = f"Meeting Summary: {meeting_title}"
        
        results = []
        for email in to_emails:
            try:
                self.send_email(email, subject, html, text)
                results.append({"email": email, "success": True})
            except Exception as e:
                logger.error(f"Failed to send to {email}: {e}")
                results.append({"email": email, "success": False, "error": str(e)})
        
        return results

    def _generate_action_items_html(self, assignee_name: str, meeting_title: str, 
                                   action_items: List[Dict]) -> str:
        """Generate HTML for action items email"""
        
        priority_colors = {
            'high': '#dc2626',
            'medium': '#f59e0b',
            'low': '#10b981'
        }
        
        items_html = ""
        for item in action_items:
            priority = item.get('priority', 'medium')
            priority_color = priority_colors.get(priority, '#f59e0b')
            priority_emoji = {'high': '🔴', 'medium': '🟡', 'low': '🟢'}.get(priority, '🟡')
            
            jira_section = ""
            if item.get('jira_issue_key'):
                jira_section = f"""
                <div style="margin-top: 10px; padding: 8px; background-color: #e0f2fe; border-left: 3px solid #0284c7; border-radius: 4px;">
                    <p style="margin: 0; font-size: 12px; color: #0284c7;">
                        <strong>Jira:</strong> 
                        <a href="{item.get('jira_issue_url', '#')}" style="color: #0284c7; text-decoration: none;">
                            {item.get('jira_issue_key')}
                        </a>
                    </p>
                </div>
                """
            
            items_html += f"""
            <div style="margin-bottom: 20px; padding: 15px; background-color: #f9fafb; border-left: 4px solid {priority_color}; border-radius: 6px;">
                <div style="margin-bottom: 8px;">
                    <span style="display: inline-block; padding: 3px 10px; background-color: {priority_color}; color: white; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase;">
                        {priority_emoji} {priority} Priority
                    </span>
                </div>
                <h3 style="margin: 8px 0; font-size: 16px; color: #111827;">
                    {item.get('text', 'No description')}
                </h3>
                <div style="margin-top: 10px; font-size: 13px; color: #6b7280;">
                    <p style="margin: 4px 0;"><strong>Status:</strong> {item.get('status', 'pending').replace('_', ' ').title()}</p>
                    <p style="margin: 4px 0;"><strong>Category:</strong> {item.get('category', 'General')}</p>
                </div>
                {jira_section}
            </div>
            """
        
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f3f4f6;">
            <div style="max-width: 600px; margin: 20px auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                
                <!-- Header -->
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">📋 Your Action Items</h1>
                </div>
                
                <!-- Content -->
                <div style="padding: 30px;">
                    <p style="font-size: 16px; margin-bottom: 10px;">Hi {assignee_name},</p>
                    
                    <p style="font-size: 14px; color: #6b7280; margin-bottom: 25px;">
                        You've been assigned <strong>{len(action_items)} action item(s)</strong> from the meeting 
                        <strong>"{meeting_title}"</strong>.
                    </p>
                    
                    <!-- Action Items -->
                    <div style="margin-bottom: 30px;">
                        {items_html}
                    </div>
                    
                    <!-- Footer -->
                    <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        This is an automated email from your meeting transcription system. Please do not reply to this email.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return html

    def _generate_action_items_text(self, assignee_name: str, meeting_title: str, 
                                    action_items: List[Dict]) -> str:
        """Generate plain text for action items email"""
        
        text = f"""
Your Action Items from "{meeting_title}"

Hi {assignee_name},

You've been assigned {len(action_items)} action item(s):

"""
        
        for idx, item in enumerate(action_items, 1):
            priority_emoji = {'high': '🔴', 'medium': '🟡', 'low': '🟢'}.get(item.get('priority', 'medium'), '🟡')
            text += f"\n{idx}. {item.get('text', 'No description')}\n"
            text += f"   Priority: {priority_emoji} {item.get('priority', 'medium')}\n"
            text += f"   Status: {item.get('status', 'pending').replace('_', ' ').title()}\n"
            text += f"   Category: {item.get('category', 'General')}\n"
            
            if item.get('jira_issue_key'):
                text += f"   Jira: {item.get('jira_issue_key')} - {item.get('jira_issue_url', '')}\n"
        
        text += "\n---\nThis is an automated email from your meeting transcription system."
        
        return text

    def _generate_summary_html(self, meeting_title: str, summary: str, 
                               action_items: List[Dict]) -> str:
        """Generate HTML for meeting summary email"""
        
        action_items_html = ""
        if action_items:
            items_list = ""
            for item in action_items:
                priority_emoji = {'high': '🔴', 'medium': '🟡', 'low': '🟢'}.get(item.get('priority', 'medium'), '🟡')
                items_list += f"""
                <li style="margin-bottom: 12px; padding: 10px; background-color: #f9fafb; border-radius: 4px;">
                    <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">
                        {priority_emoji} {item.get('text', 'No description')}
                    </div>
                    <div style="font-size: 13px; color: #6b7280;">
                        Assigned to: <strong>{item.get('assignee', 'Unassigned')}</strong> | 
                        Priority: {item.get('priority', 'medium').title()}
                    </div>
                </li>
                """
            
            action_items_html = f"""
            <div style="margin: 25px 0;">
                <h3 style="font-size: 16px; color: #111827; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #e5e7eb;">
                    📋 Action Items ({len(action_items)})
                </h3>
                <ol style="padding-left: 20px; margin: 0;">
                    {items_list}
                </ol>
            </div>
            """
        
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f3f4f6;">
            <div style="max-width: 600px; margin: 20px auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                
                <!-- Header -->
                <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">📝 Meeting Summary</h1>
                </div>
                
                <!-- Content -->
                <div style="padding: 30px;">
                    <h2 style="font-size: 20px; color: #111827; margin: 0 0 10px 0;">
                        {meeting_title}
                    </h2>
                    <p style="font-size: 14px; color: #6b7280; margin: 0 0 25px 0;">
                        {datetime.now().strftime('%B %d, %Y')}
                    </p>
                    
                    <!-- Summary Section -->
                    <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
                        <h3 style="font-size: 16px; color: #065f46; margin: 0 0 10px 0;">📄 Summary</h3>
                        <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6; white-space: pre-wrap;">
                            {summary}
                        </p>
                    </div>
                    
                    {action_items_html}
                    
                    <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        This is an automated email from your meeting transcription system. Please do not reply to this email.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return html

    def _generate_summary_text(self, meeting_title: str, summary: str, 
                               action_items: List[Dict]) -> str:
        """Generate plain text for meeting summary email"""
        
        text = f"""
Meeting Summary: {meeting_title}
Date: {datetime.now().strftime('%B %d, %Y')}

SUMMARY:
{summary}

ACTION ITEMS ({len(action_items)}):
"""
        
        for idx, item in enumerate(action_items, 1):
            text += f"\n{idx}. {item.get('text', 'No description')}"
            text += f"\n   Assigned to: {item.get('assignee', 'Unassigned')}"
            text += f"\n   Priority: {item.get('priority', 'medium')}\n"
        
        text += "\n---\nThis is an automated email from your meeting transcription system."
        
        return text


# Global instance
email_service = EmailService()