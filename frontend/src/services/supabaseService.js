import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionUrl: true,
    storage: window.localStorage
  }
});

// Helper functions for common operations
export const supabaseHelpers = {
  // Auth helpers
  async signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
    return { data, error };
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    return { user, error };
  },

  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    return { session, error };
  },

  // Meeting helpers
  async getMeetings() {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        participants(id, name, email, role),
        action_items(*)
      `)
      .eq('created_by', user.id)
      .order('created_at', { ascending: false });

    return { data, error };
  },

  async getMeeting(meetingId) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return { 
          data: null, 
          error: { message: 'Not authenticated', code: 'NOT_AUTHENTICATED' } 
        };
      }

      // Use the helper function to avoid nested query issues
      const { data: meetingData, error: meetingError } = await supabase
        .rpc('get_meeting_details', {
          meeting_uuid: meetingId,
          user_uuid: user.id
        });

      if (meetingError) {
        console.error('Error fetching meeting:', meetingError);
        return { data: null, error: meetingError };
      }

      if (!meetingData || meetingData.length === 0) {
        return { 
          data: null, 
          error: { 
            message: 'Meeting not found or you do not have permission to view it',
            code: 'MEETING_NOT_FOUND'
          } 
        };
      }

      // Get participants separately (simple query, no nesting)
      const { data: participants, error: partsError } = await supabase
        .from('participants')
        .select('*')
        .eq('meeting_id', meetingId);

      // Get action items separately
      const { data: actionItems, error: itemsError } = await supabase
        .from('action_items')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: false });

      // Combine the data
      const meeting = {
        ...meetingData[0],
        participants: participants || [],
        action_items: actionItems || []
      };

      return { data: meeting, error: null };
    } catch (err) {
      console.error('Exception in getMeeting:', err);
      return { 
        data: null, 
        error: { message: err.message } 
      };
    }
  },

  async createMeeting(title, audioFile) {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) throw new Error('Not authenticated');

    // Upload audio to storage
    const fileName = `${user.id}/${Date.now()}_${audioFile.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('recordings')
      .upload(fileName, audioFile, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('recordings')
      .getPublicUrl(fileName);

    // Create meeting record
    const { data, error } = await supabase
      .from('meetings')
      .insert({
        title: title || `Meeting ${new Date().toLocaleDateString()}`,
        audio_url: publicUrl,
        audio_file_path: fileName,
        audio_source: 'web',
        created_by: user.id,
        status: 'pending'
      })
      .select()
      .single();

    return { data, error, audioUrl: publicUrl };
  },

  async addParticipant(meetingId, name, email) {
    const { data, error } = await supabase
      .from('participants')
      .insert({
        meeting_id: meetingId,
        name,
        email
      })
      .select()
      .single();

    return { data, error };
  },

  async getActionItems(meetingId) {
    const { data, error } = await supabase
      .from('action_items')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false });

    return { data, error };
  },

  async updateActionItemStatus(actionItemId, status) {
    const { data, error } = await supabase
      .from('action_items')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', actionItemId)
      .select()
      .single();

    return { data, error };
  },

  async updateActionItemJira(actionItemId, jiraIssueKey, jiraIssueUrl) {
    const { data, error } = await supabase
      .from('action_items')
      .update({ 
        jira_issue_key: jiraIssueKey,
        jira_issue_url: jiraIssueUrl,
        jira_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', actionItemId)
      .select()
      .single();

    return { data, error };
  },

  async markEmailSent(actionItemId, recipientEmail) {
    const { data, error } = await supabase
      .from('action_items')
      .update({ 
        email_sent_to: recipientEmail,
        email_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', actionItemId)
      .select()
      .single();

    return { data, error };
  },

  // Role-based helpers
  async getUserMeetings() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.rpc('get_user_meetings', {
      user_uuid: user.id
    });

    return { data, error };
  },

  async getUserActionItems(userEmail) {
    const { data, error } = await supabase.rpc('get_user_action_items', {
      user_email: userEmail
    });

    return { data, error };
  },

  async isMeetingAdmin(meetingId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { isAdmin: false };

    const { data, error } = await supabase.rpc('is_meeting_admin', {
      meeting_uuid: meetingId,
      user_uuid: user.id
    });

    return { isAdmin: data, error };
  },

  async addParticipantWithRole(meetingId, name, email, role = 'user', userId = null) {
    const { data, error } = await supabase
      .from('participants')
      .insert({
        meeting_id: meetingId,
        name,
        email,
        role,
        user_id: userId
      })
      .select()
      .single();

    return { data, error };
  },

  async updateParticipantRole(participantId, role) {
    const { data, error } = await supabase
      .from('participants')
      .update({ role })
      .eq('id', participantId)
      .select()
      .single();

    return { data, error };
  },

  async getMeetingParticipants(meetingId) {
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('role', { ascending: false }); // admins first

    return { data, error };
  },

  async deleteMeeting(meetingId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    try {
      // First, get the meeting to find the audio file
      const { data: meeting, error: fetchError } = await supabase
        .from('meetings')
        .select('audio_file_path')
        .eq('id', meetingId)
        .single();

      if (fetchError) throw fetchError;

      // Delete audio file from storage if exists
      if (meeting?.audio_file_path) {
        const { error: storageError } = await supabase.storage
          .from('recordings')
          .remove([meeting.audio_file_path]);
        
        if (storageError) {
          console.error('Error deleting audio file:', storageError);
        }
      }

      // Delete meeting (cascade will handle related records)
      const { error: deleteError } = await supabase
        .from('meetings')
        .delete()
        .eq('id', meetingId);

      if (deleteError) throw deleteError;

      return { success: true };
    } catch (error) {
      console.error('Error deleting meeting:', error);
      return { error };
    }
  },

  // Real-time subscriptions
  subscribeMeetingUpdates(meetingId, callback) {
    return supabase
      .channel(`meeting-${meetingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meetings',
          filter: `id=eq.${meetingId}`
        },
        callback
      )
      .subscribe();
  },

  subscribeActionItemUpdates(meetingId, callback) {
    return supabase
      .channel(`action-items-${meetingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'action_items',
          filter: `meeting_id=eq.${meetingId}`
        },
        callback
      )
      .subscribe();
  },

  unsubscribe(subscription) {
    if (subscription) {
      supabase.removeChannel(subscription);
    }
  }
};

export default supabase;