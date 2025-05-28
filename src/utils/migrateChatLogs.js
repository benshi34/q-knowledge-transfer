import { ref, get, set } from "firebase/database";
import { database } from '../firebase';
import { modelConfigs } from '../config/modelConfigs';

export const migrateChatLogs = async (userId) => {
  if (!userId) {
    console.error('No user ID provided for migration');
    return;
  }

  try {
    console.log('Starting chat logs migration for user:', userId);
    
    // Get all chat logs
    const chatLogsRef = ref(database, `users/${userId}/chatLogs`);
    const snapshot = await get(chatLogsRef);
    const existingChats = snapshot.val() || {};

    // Check if migration is needed by looking at the structure
    const hasModelSpecificChats = Object.keys(existingChats).some(key => 
      Object.keys(modelConfigs).includes(key)
    );

    // If no model-specific chats found, data is already migrated
    if (!hasModelSpecificChats) {
      console.log('Chat logs already in new format, no migration needed');
      return existingChats;
    }

    // Create a map to store consolidated chats by problemId
    const consolidatedChats = {};

    // Iterate through each model's chats
    for (const modelId of Object.keys(modelConfigs)) {
      const modelChats = existingChats[modelId];
      if (!modelChats) continue;

      // For each problem in this model's chats
      for (const [problemId, messages] of Object.entries(modelChats)) {
        if (!Array.isArray(messages)) continue;

        // If we haven't seen this problem before, or if this chat history is longer
        if (!consolidatedChats[problemId] || 
            messages.length > consolidatedChats[problemId].length) {
          consolidatedChats[problemId] = messages;
        }
      }
    }

    // Save consolidated chats back to database
    if (Object.keys(consolidatedChats).length > 0) {
      // First, clear the old model-specific structure
      await set(chatLogsRef, null);

      // Then save the consolidated chats
      for (const [problemId, messages] of Object.entries(consolidatedChats)) {
        const newChatRef = ref(database, `users/${userId}/chatLogs/${problemId}`);
        await set(newChatRef, messages);
        console.log(`Migrated chat logs for problem: ${problemId}`);
      }
      console.log('Chat logs migration completed successfully');
    }

    return consolidatedChats;
  } catch (error) {
    console.error('Error during chat logs migration:', error);
    throw error;
  }
}; 