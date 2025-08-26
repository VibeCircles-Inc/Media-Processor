// VibeCircles Supabase Client Configuration
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables - some features may not work');
}

// Create Supabase client for user operations (uses anon key)
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

// Create Supabase client for admin operations (uses service key)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Database helper functions
const db = {
  // Authentication
  auth: {
    // Sign up new user
    signUp: async (email, password, userData = {}) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData
        }
      });
      
      if (error) throw error;
      return data;
    },

    // Sign in user
    signIn: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      return data;
    },

    // Sign out user
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },

    // Get current user
    getUser: async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      return user;
    },

    // Get current session
    getSession: async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      return session;
    },

    // Refresh session
    refreshSession: async (refreshToken) => {
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken
      });
      if (error) throw error;
      return data;
    }
  },

  // Profiles
  profiles: {
    // Get profile by ID
    getById: async (id) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    },

    // Update profile
    update: async (id, updates) => {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    // Search profiles
    search: async (searchTerm, currentUserId) => {
      const { data, error } = await supabase
        .rpc('search_users', {
          search_term: searchTerm,
          current_user_id: currentUserId
        });
      
      if (error) throw error;
      return data;
    }
  },

  // Posts
  posts: {
    // Get user feed
    getFeed: async (userId, pageSize = 20, pageOffset = 0) => {
      const { data, error } = await supabase
        .rpc('get_user_feed', {
          user_uuid: userId,
          page_size: pageSize,
          page_offset: pageOffset
        });
      
      if (error) throw error;
      return data;
    },

    // Get post by ID
    getById: async (id) => {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          profiles:user_id (id, username, full_name, avatar_url),
          likes (id, user_id),
          comments (id, user_id, content, created_at, profiles:user_id (username, full_name, avatar_url))
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    },

    // Create post
    create: async (postData) => {
      const { data, error } = await supabase
        .from('posts')
        .insert(postData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    // Update post
    update: async (id, updates) => {
      const { data, error } = await supabase
        .from('posts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    // Delete post
    delete: async (id) => {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },

    // Like/unlike post
    toggleLike: async (postId, userId) => {
      // Check if already liked
      const { data: existingLike } = await supabase
        .from('likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .single();

      if (existingLike) {
        // Unlike
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('id', existingLike.id);
        
        if (error) throw error;
        return { liked: false };
      } else {
        // Like
        const { error } = await supabase
          .from('likes')
          .insert({ post_id: postId, user_id: userId });
        
        if (error) throw error;
        return { liked: true };
      }
    }
  },

  // Comments
  comments: {
    // Get comments for post
    getByPostId: async (postId, pageSize = 20, pageOffset = 0) => {
      const { data, error } = await supabase
        .from('comments')
        .select(`
          *,
          profiles:user_id (id, username, full_name, avatar_url)
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: false })
        .range(pageOffset, pageOffset + pageSize - 1);
      
      if (error) throw error;
      return data;
    },

    // Create comment
    create: async (commentData) => {
      const { data, error } = await supabase
        .from('comments')
        .insert(commentData)
        .select(`
          *,
          profiles:user_id (id, username, full_name, avatar_url)
        `)
        .single();
      
      if (error) throw error;
      return data;
    }
  },

  // Friendships
  friendships: {
    // Get user friends
    getFriends: async (userId) => {
      const { data, error } = await supabase
        .rpc('get_user_friends', { user_uuid: userId });
      
      if (error) throw error;
      return data;
    },

    // Get pending friend requests
    getPendingRequests: async (userId) => {
      const { data, error } = await supabase
        .from('friendships')
        .select(`
          *,
          profiles:user_id (id, username, full_name, avatar_url)
        `)
        .eq('friend_id', userId)
        .eq('status', 'pending');
      
      if (error) throw error;
      return data;
    },

    // Send friend request
    sendRequest: async (userId, friendId) => {
      const { data, error } = await supabase
        .from('friendships')
        .insert({
          user_id: userId,
          friend_id: friendId,
          status: 'pending'
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    // Accept/decline friend request
    handleRequest: async (friendshipId, status) => {
      const { data, error } = await supabase
        .from('friendships')
        .update({ status })
        .eq('id', friendshipId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    }
  },

  // Messages
  messages: {
    // Get conversations
    getConversations: async (userId) => {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles!messages_sender_id_fkey (id, username, full_name, avatar_url),
          receiver:profiles!messages_receiver_id_fkey (id, username, full_name, avatar_url)
        `)
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },

    // Get conversation with specific user
    getConversation: async (userId, otherUserId) => {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles!messages_sender_id_fkey (id, username, full_name, avatar_url),
          receiver:profiles!messages_receiver_id_fkey (id, username, full_name, avatar_url)
        `)
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data;
    },

    // Send message
    send: async (senderId, receiverId, content, mediaUrl = null) => {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: senderId,
          receiver_id: receiverId,
          content,
          media_url: mediaUrl
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    // Mark messages as read
    markAsRead: async (userId, otherUserId) => {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('receiver_id', userId)
        .eq('sender_id', otherUserId)
        .eq('is_read', false);
      
      if (error) throw error;
    }
  },

  // Notifications
  notifications: {
    // Get user notifications
    getByUserId: async (userId, pageSize = 20, pageOffset = 0) => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(pageOffset, pageOffset + pageSize - 1);
      
      if (error) throw error;
      return data;
    },

    // Mark notification as read
    markAsRead: async (notificationId) => {
      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    // Mark all notifications as read
    markAllAsRead: async (userId) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);
      
      if (error) throw error;
    }
  },

  // Real-time subscriptions
  realtime: {
    // Subscribe to posts
    subscribeToPosts: (callback) => {
      return supabase
        .channel('posts')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'posts'
        }, callback)
        .subscribe();
    },

    // Subscribe to messages
    subscribeToMessages: (userId, callback) => {
      return supabase
        .channel(`messages:${userId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`
        }, callback)
        .subscribe();
    },

    // Subscribe to notifications
    subscribeToNotifications: (userId, callback) => {
      return supabase
        .channel(`notifications:${userId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        }, callback)
        .subscribe();
    }
  }
};

module.exports = {
  supabase,
  supabaseAdmin,
  db
};
