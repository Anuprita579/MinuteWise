import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@meeting_participants';

export const participantService = {
  /**
   * Save participants for current meeting
   * @param {Array} participants - Array of participant objects
   */
  async saveParticipants(participants) {
    try {
      const jsonValue = JSON.stringify(participants);
      await AsyncStorage.setItem(STORAGE_KEY, jsonValue);
      return { success: true };
    } catch (error) {
      console.error('Error saving participants:', error);
      throw error;
    }
  },

  /**
   * Get saved participants
   * @returns {Promise<Array>} Array of participant objects
   */
  async getParticipants() {
    try {
      const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
      return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (error) {
      console.error('Error loading participants:', error);
      return [];
    }
  },

  /**
   * Clear participants after meeting ends
   */
  async clearParticipants() {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return { success: true };
    } catch (error) {
      console.error('Error clearing participants:', error);
      throw error;
    }
  },

  /**
   * Validate email format
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  /**
   * Validate participant data
   */
  validateParticipant(participant) {
    if (!participant.name || participant.name.trim().length === 0) {
      return { valid: false, error: 'Name is required' };
    }
    
    if (!participant.email || !this.validateEmail(participant.email)) {
      return { valid: false, error: 'Valid email is required' };
    }
    
    return { valid: true };
  },

  /**
   * Format participant name for email
   */
  formatEmailFromName(name) {
    return name.toLowerCase().replace(/\s+/g, '.');
  }
};