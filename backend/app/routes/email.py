from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import os
import logging
from bson import ObjectId
from datetime import datetime
from dotenv import load_dotenv
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()

from ..utils.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Email Configuration
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_EMAIL = os.getenv("SMTP_EMAIL")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
APP_URL = os.getenv("APP_URL", "http://localhost:3000")


class ActionItemEmailRequest(BaseModel):
    meeting_id: str
    action_item_index: int
    recipient_email: EmailStr


class MeetingSummaryEmailRequest(BaseModel):
    meeting_id: str
    recipient_emails: List[EmailStr]


class BulkActionItemEmailRequest(BaseModel):
    meeting_id: str
    action_item_indices: List[int]
    # Email will be sent to assignee_email field in each action item


def get_email_config():
    """Validate email configuration"""
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        raise HTTPException(
            status_code=400,
            detail="Email not configured. Set SMTP_EMAIL and SMTP_PASSWORD in .env"
        )
    return SMTP_EMAIL, SMTP_PASSWORD


def send_email(to_email: str, subject: str, html_body: str, text_body: str = None):
    """Send email using SMTP"""
    smtp_email, smtp_password = get_email_config()
    
    msg = MIMEMultipart('alternative')
    msg['From'] = smtp_email
    msg['To'] = to_email
    msg['Subject'] = subject
    
    # Add text and HTML versions
    if text_body:
        msg.attach(MIMEText(text_body, 'plain'))
    msg.attach(MIMEText(html_body, 'html'))
    
    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.send_message(msg)
            logger.info(f"Email sent successfully to {to_email}")
            return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


def generate_action_item_email(action_item: dict, meeting: dict, jira_key: str = None) -> tuple:
    """Generate HTML email for action item assignment"""
    meeting_title = meeting.get('title', 'Untitled Meeting')
    meeting_date = meeting.get('created_at', datetime.utcnow()).strftime('%B %d, %Y at %I:%M %p')
    
    priority_colors = {
        'high': '#dc2626',
        'medium': '#f59e0b',
        'low': '#10b981'
    }
    priority = action_item.get('priority', 'medium')
    priority_color = priority_colors.get(priority, '#f59e0b')
    
    action_text = action_item.get('text', 'No description')
    assignee = action_item.get('assignee', 'Unassigned')
    due_date = action_item.get('due_date', 'Not set')
    status = action_item.get('status', 'pending').replace('_', ' ').title()
    
    # Build Jira link if exists
    jira_section = ""
    if jira_key:
        jira_url = action_item.get('jira_issue_url', '')
        jira_section = f"""
        <div style="margin: 15px 0; padding: 12px; background-color: #e0f2fe; border-left: 4px solid #0284c7; border-radius: 4px;">
            <p style="margin: 0; font-weight: 600; color: #0284c7;">Jira Ticket Created</p>
            <p style="margin: 5px 0 0 0;"><a href="{jira_url}" style="color: #0284c7; text-decoration: none;">{jira_key}</a></p>
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
                <h1 style="color: white; margin: 0; font-size: 24px;">Action Item Assigned</h1>
            </div>
            
            <!-- Content -->
            <div style="padding: 30px;">
                <p style="font-size: 16px; margin-bottom: 20px;">Hi {assignee},</p>
                
                <p style="font-size: 14px; color: #6b7280; margin-bottom: 25px;">
                    You've been assigned an action item from the meeting <strong>"{meeting_title}"</strong> held on {meeting_date}.
                </p>
                
                <!-- Action Item Card -->
                <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 20px; margin-bottom: 20px;">
                    <div style="margin-bottom: 15px;">
                        <span style="display: inline-block; padding: 4px 12px; background-color: {priority_color}; color: white; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                            {priority} Priority
                        </span>
                    </div>
                    
                    <h2 style="font-size: 18px; margin: 0 0 15px 0; color: #111827;">
                        {action_text}
                    </h2>
                    
                    <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 15px;">
                        <table style="width: 100%; font-size: 14px;">
                            <tr>
                                <td style="padding: 5px 0; color: #6b7280; width: 30%;">Status:</td>
                                <td style="padding: 5px 0; font-weight: 600;">{status}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 0; color: #6b7280;">Due Date:</td>
                                <td style="padding: 5px 0; font-weight: 600;">{due_date}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 0; color: #6b7280;">Assignee:</td>
                                <td style="padding: 5px 0; font-weight: 600;">{assignee}</td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                {jira_section}
                
                <!-- CTA Button -->
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{APP_URL}/meetings/{meeting.get('_id')}" 
                       style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
                        View Full Meeting Details
                    </a>
                </div>
                
                <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    This is an automated email from your meeting transcription system. Please do not reply to this email.
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    
    text = f"""
Action Item Assigned

Hi {assignee},

You've been assigned an action item from the meeting "{meeting_title}" held on {meeting_date}.

Action Item: {action_text}
Priority: {priority}
Status: {status}
Due Date: {due_date}

{"Jira Ticket: " + jira_key if jira_key else ""}

View full meeting details: {APP_URL}/meetings/{meeting.get('_id')}
    """
    
    return html, text


def generate_meeting_summary_email(meeting: dict) -> tuple:
    """Generate HTML email for meeting summary"""
    meeting_title = meeting.get('title', 'Untitled Meeting')
    meeting_date = meeting.get('created_at', datetime.utcnow()).strftime('%B %d, %Y at %I:%M %p')
    summary = meeting.get('summary', 'No summary available')
    action_items = meeting.get('action_items', [])
    
    # Build action items HTML
    action_items_html = ""
    if action_items:
        items_list = ""
        for idx, item in enumerate(action_items, 1):
            priority = item.get('priority', 'medium')
            priority_emoji = {'high': '🔴', 'medium': '🟡', 'low': '🟢'}.get(priority, '🟡')
            assignee = item.get('assignee', 'Unassigned')
            
            items_list += f"""
            <li style="margin-bottom: 12px; padding: 10px; background-color: #f9fafb; border-radius: 4px;">
                <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">
                    {priority_emoji} {item.get('text', 'No description')}
                </div>
                <div style="font-size: 13px; color: #6b7280;">
                    Assigned to: <strong>{assignee}</strong> | Priority: {priority.title()}
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
                <h1 style="color: white; margin: 0; font-size: 24px;">Meeting Summary</h1>
            </div>
            
            <!-- Content -->
            <div style="padding: 30px;">
                <h2 style="font-size: 20px; color: #111827; margin: 0 0 10px 0;">
                    {meeting_title}
                </h2>
                <p style="font-size: 14px; color: #6b7280; margin: 0 0 25px 0;">
                    {meeting_date}
                </p>
                
                <!-- Summary Section -->
                <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
                    <h3 style="font-size: 16px; color: #065f46; margin: 0 0 10px 0;">📝 Summary</h3>
                    <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">
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
    
    text = f"""
Meeting Summary: {meeting_title}
Date: {meeting_date}

Summary:
{summary}

Action Items ({len(action_items)}):
"""
    
    for idx, item in enumerate(action_items, 1):
        text += f"\n{idx}. {item.get('text', 'No description')}"
        text += f"\n   Assigned to: {item.get('assignee', 'Unassigned')}"
        text += f"\n   Priority: {item.get('priority', 'medium')}\n"
    
    text += f"\n\nView full meeting details: {APP_URL}/meetings/{meeting.get('_id')}"
    
    return html, text


@router.post("/send-action-item-email")
async def send_action_item_email(
    email_data: ActionItemEmailRequest,
    request: Request,
    current_user=Depends(get_current_user)
):
    """Send email notification for a single action item"""
    try:
        # Fetch meeting
        meeting = await request.app.mongodb.meetings.find_one(
            {"_id": ObjectId(email_data.meeting_id)}
        )
        
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Check access
        has_access = (
            meeting["created_by"] == ObjectId(current_user["_id"]) or
            any(p.get("user_id") == ObjectId(current_user["_id"]) 
                for p in meeting.get("participants", []))
        )
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get action item
        action_items = meeting.get("action_items", [])
        if email_data.action_item_index >= len(action_items):
            raise HTTPException(status_code=404, detail="Action item not found")
        
        action_item = action_items[email_data.action_item_index]
        
        # Generate email content
        jira_key = action_item.get('jira_issue_key')
        html_body, text_body = generate_action_item_email(action_item, meeting, jira_key)
        
        subject = f"Action Item Assigned: {action_item.get('text', 'Task')[:50]}"
        
        # Send email
        send_email(email_data.recipient_email, subject, html_body, text_body)
        
        # Update action item with email sent timestamp
        update_path = f"action_items.{email_data.action_item_index}"
        await request.app.mongodb.meetings.update_one(
            {"_id": ObjectId(email_data.meeting_id)},
            {
                "$set": {
                    f"{update_path}.email_sent_to": email_data.recipient_email,
                    f"{update_path}.email_sent_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        return {
            "success": True,
            "message": f"Email sent successfully to {email_data.recipient_email}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending action item email: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


@router.post("/send-meeting-summary")
async def send_meeting_summary_email(
    email_data: MeetingSummaryEmailRequest,
    request: Request,
    current_user=Depends(get_current_user)
):
    """Send meeting summary email to multiple recipients"""
    try:
        # Fetch meeting
        meeting = await request.app.mongodb.meetings.find_one(
            {"_id": ObjectId(email_data.meeting_id)}
        )
        
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Check access
        has_access = (
            meeting["created_by"] == ObjectId(current_user["_id"]) or
            any(p.get("user_id") == ObjectId(current_user["_id"]) 
                for p in meeting.get("participants", []))
        )
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Generate email content
        html_body, text_body = generate_meeting_summary_email(meeting)
        subject = f"Meeting Summary: {meeting.get('title', 'Untitled Meeting')}"
        
        # Send to all recipients
        results = []
        for recipient in email_data.recipient_emails:
            try:
                send_email(recipient, subject, html_body, text_body)
                results.append({"email": recipient, "success": True})
            except Exception as e:
                logger.error(f"Failed to send to {recipient}: {e}")
                results.append({"email": recipient, "success": False, "error": str(e)})
        
        success_count = sum(1 for r in results if r["success"])
        
        return {
            "success": True,
            "total": len(email_data.recipient_emails),
            "success_count": success_count,
            "results": results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending meeting summary: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to send emails: {str(e)}")


@router.get("/test-email-config")
async def test_email_config(current_user=Depends(get_current_user)):
    """Test email configuration"""
    try:
        smtp_email, smtp_password = get_email_config()
        
        # Test SMTP connection
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(smtp_email, smtp_password)
        
        return {
            "success": True,
            "message": "Email configuration is valid",
            "smtp_email": smtp_email,
            "smtp_server": SMTP_SERVER
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Email config test failed: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }