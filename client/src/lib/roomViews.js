import { Brain, MessageSquare, Swords } from 'lucide-react';

// The sections of a room. Each one is its own view, so chat, battles and quizzes never crowd each other.
export const roomViews = ({ battleRoom, liveBattles, quizLive }) =>
  battleRoom
    ? [
        { id: 'battles', label: 'Battle', icon: Swords },
        { id: 'chat', label: 'Chat', icon: MessageSquare },
      ]
    : [
        { id: 'chat', label: 'Chat', icon: MessageSquare },
        { id: 'battles', label: 'Battles', icon: Swords, badge: liveBattles || null },
        { id: 'quiz', label: 'Quiz', icon: Brain, badge: quizLive ? 'Live' : null },
      ];
