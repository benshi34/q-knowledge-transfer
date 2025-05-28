import React, { useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useParams } from 'react-router-dom';
import { useChat } from './ChatProvider';
import { saveNotes, getNotes } from '../firebase/database';
import './Notes.css';

const Notes = () => {
  const { problemId } = useParams();
  const { user } = useChat();
  const isCustomWorkspace = problemId.startsWith('custom-');

  // Create a debounced save function
  const debouncedSave = useCallback(
    (() => {
      let timeoutId;
      return (content) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(async () => {
          // Save to Firebase if it's not a custom workspace
          if (!isCustomWorkspace && user) {
            await saveNotes(user.uid, problemId, content);
          }
          // Always save to localStorage
          localStorage.setItem(`notes-${problemId}`, content);
        }, 1000); // Wait 1 second after the user stops typing
      };
    })(),
    [user, problemId, isCustomWorkspace]
  );

  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p></p>',
    editable: true,
    autofocus: true,
    onUpdate: ({ editor }) => {
      const content = editor.getHTML();
      debouncedSave(content);
    },
  });

  useEffect(() => {
    const loadNotes = async () => {
      if (!editor) return;

      let content = '';
      if (isCustomWorkspace) {
        // For custom workspaces, only use localStorage
        content = localStorage.getItem(`notes-${problemId}`) || '';
      } else if (user) {
        // For regular problems, try Firebase first, then fall back to localStorage
        try {
          content = await getNotes(user.uid, problemId) || '';
          if (!content) {
            content = localStorage.getItem(`notes-${problemId}`) || '';
          }
        } catch (error) {
          console.error('Error loading notes:', error);
          content = localStorage.getItem(`notes-${problemId}`) || '';
        }
      }

      editor.commands.setContent(content || '<p></p>');
    };

    loadNotes();
  }, [editor, problemId, user, isCustomWorkspace]);

  if (!editor) {
    return null;
  }

  return (
    <div className="notes-container">
      <div className="notes-header">
        <h3>Notes</h3>
        <small>Your notes will be provided to the AI assistant</small>
      </div>
      <div className="notes-editor">
        <EditorContent 
          editor={editor} 
          className="notes-editable"
        />
      </div>
    </div>
  );
};

export default Notes; 