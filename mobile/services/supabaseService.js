import { supabase } from '../config/supabase';
import { File } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';

const BUCKET_NAME = 'recordings';

export const supabaseService = {
  supabase,

  async uploadAudio(uri, userId) {
    try {
      console.log('📤 Starting upload for URI:', uri);
      
      const file = new File(uri);
      
      // Check if file exists
      const fileExists = typeof file.exists === 'function' ? await file.exists() : file.exists;
      
      if (!fileExists) {
        throw new Error('File does not exist');
      }
      
      console.log('✅ File exists, size:', file.size);

      const timestamp = Date.now();
      const filename = `${userId}/${timestamp}.wav`;

      console.log('📤 Uploading to Supabase:', filename);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${filename}`;

      const uploadResult = await FileSystemLegacy.uploadAsync(uploadUrl, uri, {
        httpMethod: 'POST',
        uploadType: FileSystemLegacy.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'audio/wav',
          'x-upsert': 'false',
        },
      });

      console.log('✅ Upload result status:', uploadResult.status);

      if (uploadResult.status !== 200) {
        const errorBody = JSON.parse(uploadResult.body);
        throw new Error(errorBody.message || `Upload failed with status ${uploadResult.status}`);
      }

      const responseData = JSON.parse(uploadResult.body);

      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filename);

      return {
        success: true,
        path: filename,
        fullPath: responseData.Key || `${BUCKET_NAME}/${filename}`,
        publicUrl: urlData.publicUrl,
        timestamp,
      };
    } catch (error) {
      console.error('❌ Supabase upload error:', error);
      throw new Error(`Upload failed: ${error.message}`);
    }
  },

  async deleteAudio(path) {
    try {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([path]);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Delete error:', error);
      throw error;
    }
  },

  async createMeeting(data) {
    try {
      console.log('📝 Creating meeting in database:', data.title);

      const { data: meeting, error } = await supabase
        .from('meetings')
        .insert([{
          title: data.title,
          audio_url: data.audio_url,
          audio_file_path: data.audio_file_path,
          audio_source: data.audio_source || 'mobile',
          created_by: data.created_by,
          status: 'pending',
        }])
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Meeting created:', meeting.id);
      return meeting;
    } catch (error) {
      console.error('❌ Create meeting error:', error);
      throw error;
    }
  },

  async getUserMeetings(userId) {
    try {
      console.log('📥 Fetching meetings for user:', userId);

      const { data, error } = await supabase
        .from('meetings')
        .select(`
          *,
          participants(*),
          action_items(*)
        `)
        .eq('created_by', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log(`✅ Fetched ${data.length} meetings`);
      return data;
    } catch (error) {
      console.error('❌ Fetch meetings error:', error);
      throw error;
    }
  },

  async getMeetingById(meetingId) {
    try {
      console.log('📥 Fetching meeting:', meetingId);

      const { data, error } = await supabase
        .from('meetings')
        .select(`
          *,
          participants(*),
          action_items(*)
        `)
        .eq('id', meetingId)
        .single();

      if (error) throw error;

      console.log('✅ Meeting fetched:', data.title);
      return data;
    } catch (error) {
      console.error('❌ Fetch meeting error:', error);
      throw error;
    }
  },

  async updateMeeting(meetingId, updates) {
    try {
      console.log('📝 Updating meeting:', meetingId);

      const { data, error } = await supabase
        .from('meetings')
        .update(updates)
        .eq('id', meetingId)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Meeting updated');
      return data;
    } catch (error) {
      console.error('❌ Update meeting error:', error);
      throw error;
    }
  },

  async deleteMeeting(meetingId) {
    try {
      console.log('🗑️ Deleting meeting:', meetingId);

      // Get meeting to find audio file path
      const { data: meeting } = await supabase
        .from('meetings')
        .select('audio_file_path')
        .eq('id', meetingId)
        .single();

      // Delete from database (cascade deletes participants and action items)
      const { error: dbError } = await supabase
        .from('meetings')
        .delete()
        .eq('id', meetingId);

      if (dbError) throw dbError;

      // Delete audio file from storage
      if (meeting?.audio_file_path) {
        await this.deleteAudio(meeting.audio_file_path);
      }

      console.log('✅ Meeting deleted successfully');
      return { success: true };
    } catch (error) {
      console.error('❌ Delete meeting error:', error);
      throw error;
    }
  },

  async addParticipants(meetingId, participants) {
    try {
      console.log(`📝 Adding ${participants.length} participants to meeting`);

      const participantRecords = participants.map(p => ({
        meeting_id: meetingId,
        name: p.name,
        email: p.email,
        user_id: p.user_id || null,
      }));

      const { data, error } = await supabase
        .from('participants')
        .insert(participantRecords)
        .select();

      if (error) throw error;

      console.log('✅ Participants added');
      return data;
    } catch (error) {
      console.error('❌ Add participants error:', error);
      throw error;
    }
  },

  async addActionItems(meetingId, actionItems) {
    try {
      console.log(`📝 Adding ${actionItems.length} action items to meeting`);

      const actionItemRecords = actionItems.map(item => ({
        meeting_id: meetingId,
        text: item.text,
        assignee: item.assignee,
        assignee_email: item.assignee_email,
        priority: item.priority || 'medium',
        status: item.status || 'pending',
        category: item.category || 'General',
        completed: item.completed || false,
        confidence: item.confidence || 0.0,
        source_sentence: item.source_sentence,
        extraction_method: item.extraction_method,
      }));

      const { data, error } = await supabase
        .from('action_items')
        .insert(actionItemRecords)
        .select();

      if (error) throw error;

      console.log('✅ Action items added');
      return data;
    } catch (error) {
      console.error('❌ Add action items error:', error);
      throw error;
    }
  },

  async updateActionItemStatus(actionItemId, status) {
    try {
      console.log(`📝 Updating action item ${actionItemId} to status: ${status}`);

      const { data, error } = await supabase
        .from('action_items')
        .update({ 
          status,
          completed: status === 'completed',
        })
        .eq('id', actionItemId)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Action item status updated');
      return data;
    } catch (error) {
      console.error('❌ Update action item error:', error);
      throw error;
    }
  },

  async getActionItems(meetingId) {
    try {
      const { data, error } = await supabase
        .from('action_items')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Get action items error:', error);
      throw error;
    }
  },

  async createMeetingWithParticipants(audioUri, title, participants, userId) {
    try {
      console.log('🚀 Starting complete meeting creation workflow');

      // Step 1: Upload audio to storage
      console.log('Step 1: Uploading audio...');
      const uploadResult = await this.uploadAudio(audioUri, userId);

      // Step 2: Create meeting record
      console.log('Step 2: Creating meeting record...');
      const meeting = await this.createMeeting({
        title,
        audio_url: uploadResult.publicUrl,
        audio_file_path: uploadResult.path,
        audio_source: 'mobile',
        created_by: userId,
      });

      // Step 3: Add participants
      if (participants && participants.length > 0) {
        console.log('Step 3: Adding participants...');
        await this.addParticipants(meeting.id, participants);
      }

      return {
        ...meeting,
        audioUrl: uploadResult.publicUrl,
        participants,
      };
    } catch (error) {
      console.error('❌ Meeting creation workflow failed:', error);
      throw error;
    }
  },
};