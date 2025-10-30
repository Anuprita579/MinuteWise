// src/services/supabaseService.js - FIXED VERSION
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    try {
      // First, get the meeting to find the audio file
      const { data: meeting, error: fetchError } = await supabase
        .from('meetings')
        .select('audio_file_path')
        .eq('id', meetingId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

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

  async addParticipants(meetingId, participants, creatorUserId) {
    try {
      console.log(`📝 Adding ${participants.length} participants to meeting`);

      // Get creator's email to match against participants
      let creatorEmail = null;
      if (creatorUserId) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          creatorEmail = user?.email?.toLowerCase();
          console.log('👤 Creator email:', creatorEmail);
        } catch (error) {
          console.warn('Could not get creator email:', error);
        }
      }

      const participantRecords = participants.map((p, index) => {
        // Check if this participant is the creator
        const isCreator = creatorEmail && p.email?.toLowerCase() === creatorEmail;
        
        // First participant OR matching creator email should be admin
        const role = (index === 0 || isCreator) ? 'admin' : 'user';
        
        console.log(`  - ${p.name} (${p.email}): ${role}${isCreator ? ' [creator]' : ''}`);

        return {
          meeting_id: meetingId,
          name: p.name,
          email: p.email,
          user_id: isCreator ? creatorUserId : (p.user_id || null),
          role: role, // ✅ NOW SETTING ROLE
        };
      });

      const { data, error } = await supabase
        .from('participants')
        .insert(participantRecords)
        .select();

      if (error) throw error;

      console.log('✅ Participants added with roles');
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

      // Step 3: Add participants WITH ROLES ✅
      if (participants && participants.length > 0) {
        console.log('Step 3: Adding participants with proper roles...');
        await this.addParticipants(meeting.id, participants, userId); // ✅ Passing userId
      }

      console.log('✅ Meeting creation workflow complete!');

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