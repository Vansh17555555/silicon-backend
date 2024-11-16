require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Security-enhanced middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// MongoDB connection with enhanced error handling
mongoose.connect(process.env.mongodb_uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Successfully connected to MongoDB'))
.catch(error => {
  console.error('MongoDB connection error:', error);
  process.exit(1);
});

// Enhanced Schema Definitions
const ReflectionSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
  },
  path: {
    type: String,
    required: true,
    enum: ['personal', 'career', 'health', 'creativity'],
  },
  
  timestamp: {
    type: Date,
    default: Date.now,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  analysis: {
    sentiment: {
      score: Number,
      label: String,
    },
    topics: [String],
    keyInsights: [String],
    suggestedActions: [String],
  },
  futurePrompt: {
    content: String,
    deliveryDate: Date,
    isDelivered: {
      type: Boolean,
      default: false,
    },
  },
  mediaUrl: String,
  mediaType: {
    type: String,
    enum: ['text', 'audio', 'image'],
    default: 'text',
  },
});

const MilestoneSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: String,
  path: {
    type: String,
    required: true,
  },
  targetDate: Date,
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed'],
    default: 'pending',
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  aiRecommendations: {
    strategies: [String],
    potentialObstacles: [String],
    nextSteps: [String],
  },
  relatedReflections: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reflection',
  }],
  checkIns: [{
    date: Date,
    content: String,
    progress: Number,
    aiFeedback: String,
  }],
});

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  preferences: {
    reminderFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'weekly',
    },
    selectedPaths: [{
      type: String,
      enum: ['personal', 'career', 'health', 'creativity'],
    }],
    aiSettings: {
      insightFrequency: {
        type: String,
        enum: ['always', 'weekly', 'monthly'],
        default: 'always',
      },
      preferredTone: {
        type: String,
        enum: ['encouraging', 'analytical', 'direct'],
        default: 'encouraging',
      },
    },
  },
  growthProfile: {
    strengths: [String],
    focusAreas: [String],
    learningStyle: String,
    lastUpdated: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Models
const Reflection = mongoose.model('Reflection', ReflectionSchema);
const Milestone = mongoose.model('Milestone', MilestoneSchema);
const User = mongoose.model('User', UserSchema);

// AI Helper Functions with Gemini integration
async function analyzeReflection(content) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      const prompt = `Analyze this reflection and provide the following in JSON format:
        {
          "sentiment": {
            "score": <number between -1 and 1>,
            "label": <string>
          },
          "topics": <array of strings>,
          "keyInsights": <array of strings>,
          "suggestedActions": <array of strings>
        }
  
        Reflection: ${content}`;
  
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Remove any markdown formatting or backticks that might be present
      const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
      
      try {
        return JSON.parse(cleanedText);
      } catch (parseError) {
        console.error('JSON parsing error:', parseError);
        console.error('Raw response:', text);
        
        // Fallback response if parsing fails
        return {
          sentiment: {
            score: 0,
            label: "neutral"
          },
          topics: ["Unable to parse topics"],
          keyInsights: ["Analysis unavailable"],
          suggestedActions: ["Please try again"]
        };
      }
    } catch (error) {
      console.error('Error analyzing reflection:', error);
      // Instead of throwing, return a fallback response
      return {
        sentiment: {
          score: 0,
          label: "neutral"
        },
        topics: ["Analysis error"],
        keyInsights: ["Unable to analyze reflection"],
        suggestedActions: ["Please try again later"]
      };
    }
  }

  async function generatePersonalizedPrompt(user, recentReflections) {
    try {
      // Log the user preferences to debug
      console.log('User Preferences:', user.preferences);
  
      // Ensure aiSettings exists, set defaults if missing
      let aiSettings = user.preferences?.aiSettings;
      if (!aiSettings) {
        console.log('No aiSettings found for user, setting defaults...');
        aiSettings = {
          insightFrequency: 'always',  // Default value
          preferredTone: 'encouraging',  // Default value
        };
      }
  
      // Generate the AI prompt
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{
          role: "system",
          content: "Generate a personalized reflection prompt based on the user's profile and recent reflections."
        }, {
          role: "user",
          content: JSON.stringify({
            userProfile: user.growthProfile,
            recentReflections: recentReflections,
            preferredTone: aiSettings.preferredTone,  // Use preferredTone from aiSettings
          })
        }],
      });
  
      const prompt = response.choices[0].message.content;
      const deliveryDate = new Date();
      deliveryDate.setDate(deliveryDate.getDate() + 7);  // Set future delivery date
  
      return {
        content: prompt,
        deliveryDate,
      };
    } catch (error) {
      console.error('Error generating prompt:', error);
      return null;
    }
  }
  async function provideMilestoneRecommendations(milestone) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  
      // Prepare the prompt for the model
      const prompt = `Analyze this milestone and provide:
        1. Effective strategies
        2. Potential obstacles
        3. Concrete next steps
        Format the response as JSON.
        
        Milestone: ${JSON.stringify(milestone)}`;
  
      // Call the model to generate the content
      const result = await model.generateContent(prompt);
      const response = await result.response;
  
      // Log the raw response to understand its structure
      console.log('Raw response:', response.text()); // Log the raw response
  
      // Clean the response
      let cleanResponseText = response.text();
      cleanResponseText = cleanResponseText.replace(/```json|```/g, ''); // Remove code block markers
      cleanResponseText = cleanResponseText.trim(); // Trim whitespace
  
      // Try parsing the cleaned response
      try {
        const parsedResponse = JSON.parse(cleanResponseText);
        return parsedResponse;
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
        throw new Error('Failed to parse milestone recommendations response');
      }
  
    } catch (error) {
      console.error('Error generating recommendations:', error);
      throw new Error('Failed to generate milestone recommendations');
    }
  }
// Create new reflection
app.post('/api/reflections', async (req, res) => {
  try {
    const { content, path, userId, mediaUrl, mediaType } = req.body;
    
    if (!content || !path || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const analysis = await analyzeReflection(content);
    

    const recentReflections = await Reflection.find({ userId })
      .sort({ timestamp: -1 })
      .limit(5);
    
    const futurePrompt = await generatePersonalizedPrompt(userId, recentReflections);

    const reflection = new Reflection({
      content,
      path,
      userId,
      mediaUrl,
      mediaType,
      analysis,
      futurePrompt,
    });

    await reflection.save();
    res.status(201).json(reflection);
  } catch (error) {
    console.error('Error in /api/reflections:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all reflections for a user
app.get('/api/reflections/:userId', async (req, res) => {
  try {
    const reflections = await Reflection.find({ userId: req.params.userId })
      .sort({ timestamp: -1 });
    res.json(reflections);
  } catch (error) {
    console.error('Error fetching reflections:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new milestone
app.post('/api/milestones', async (req, res) => {
  try {
    if (!req.body.title || !req.body.path || !req.body.userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const milestone = new Milestone(req.body);

    const aiRecommendations = await provideMilestoneRecommendations(milestone);
    milestone.aiRecommendations = aiRecommendations;
    
    await milestone.save();
    res.status(201).json(milestone);
  } catch (error) {
    console.error('Error creating milestone:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update milestone with check-in
app.patch('/api/milestones/:id/checkin', async (req, res) => {
  try {
    const { content, progress } = req.body;
    if (typeof progress !== 'number' || !content) {
      return res.status(400).json({ error: 'Invalid check-in data' });
    }

    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }
    
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `Provide constructive feedback on this milestone check-in:
      Progress: ${progress}%
      Update: ${content}`;

    const result = await model.generateContent(prompt);
    const feedback = await result.response;
    
    milestone.checkIns.push({
      date: new Date(),
      content,
      progress,
      aiFeedback: feedback.text(),
    });
    
    if (progress >= 100) {
      milestone.status = 'completed';
    } else if (progress > 0) {
      milestone.status = 'in-progress';
    }

    await milestone.save();
    res.json(milestone);
  } catch (error) {
    console.error('Error updating milestone:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get insights for a user
app.get('/api/insights/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const reflections = await Reflection.find({ userId: req.params.userId })
      .sort({ timestamp: -1 })
      .limit(10);
    
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `Generate personalized insights based on these recent reflections and user profile: ${JSON.stringify({
      userProfile: user.growthProfile,
      reflections: reflections,
    })}. Format the response as JSON.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json(JSON.parse(response.text()));
  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get growth path recommendations
app.get('/api/recommendations/paths/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const reflections = await Reflection.find({ userId: req.params.userId })
      .sort({ timestamp: -1 })
      .limit(20);
    
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `Recommend new growth paths and areas of focus based on this user's journey: ${JSON.stringify({
      userProfile: user.growthProfile,
      reflections: reflections,
    })}. Format the response as JSON.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json(JSON.parse(response.text()));
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all milestones for a user
app.get('/api/milestones/:userId', async (req, res) => {
  try {
    const milestones = await Milestone.find({ userId: req.params.userId })
      .sort({ targetDate: 1 });
    res.json(milestones);
  } catch (error) {
    console.error('Error fetching milestones:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update user preferences
app.patch('/api/users/:userId/preferences', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $set: { preferences: req.body } },
      { new: true, runValidators: true }
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update growth profile
app.patch('/api/users/:userId/growth-profile', async (req, res) => {
  try {
    const growthProfile = {
      ...req.body,
      lastUpdated: new Date()
    };
    
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $set: { growthProfile: growthProfile } },
      { new: true, runValidators: true }
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error updating growth profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
  });
  
  // Delete routes
  app.delete('/api/reflections/:id', async (req, res) => {
    try {
      const reflection = await Reflection.findByIdAndDelete(req.params.id);
      if (!reflection) {
        return res.status(404).json({ error: 'Reflection not found' });
      }
      res.json({ message: 'Reflection deleted successfully' });
    } catch (error) {
      console.error('Error deleting reflection:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  app.delete('/api/milestones/:id', async (req, res) => {
    try {
      const milestone = await Milestone.findByIdAndDelete(req.params.id);
      if (!milestone) {
        return res.status(404).json({ error: 'Milestone not found' });
      }
      res.json({ message: 'Milestone deleted successfully' });
    } catch (error) {
      console.error('Error deleting milestone:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Search routes
  app.get('/api/search/reflections', async (req, res) => {
    try {
      const { userId, query, path } = req.query;
      const searchCriteria = {
        userId: userId,
        $text: { $search: query }
      };
      
      if (path) {
        searchCriteria.path = path;
      }
      
      const reflections = await Reflection.find(searchCriteria)
        .sort({ timestamp: -1 });
      res.json(reflections);
    } catch (error) {
      console.error('Error searching reflections:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Analytics routes
  app.get('/api/analytics/progress/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      const timeframe = req.query.timeframe || '30'; // Default to 30 days
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(timeframe));
      
      // Get reflections and milestones within timeframe
      const [reflections, milestones] = await Promise.all([
        Reflection.find({
          userId,
          timestamp: { $gte: startDate }
        }),
        Milestone.find({
          userId,
          'checkIns.date': { $gte: startDate }
        })
      ]);
      
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      const prompt = `Analyze this user's progress over the past ${timeframe} days:
        Number of reflections: ${reflections.length}
        Number of milestones with activity: ${milestones.length}
        
        Recent reflection topics: ${reflections.map(r => r.analysis.topics).flat()}
        Milestone progress: ${milestones.map(m => ({
          title: m.title,
          progress: m.checkIns[m.checkIns.length - 1]?.progress || 0
        }))}
        
        Provide a JSON response with:
        1. Growth trends
        2. Areas of progress
        3. Suggested focus areas
        4. Achievement highlights`;
  
      const result = await model.generateContent(prompt);
      const analysis = await result.response;
      
      res.json({
        timeframe,
        metrics: {
          totalReflections: reflections.length,
          activeMilestones: milestones.length,
          completedMilestones: milestones.filter(m => m.status === 'completed').length,
          averageProgress: milestones.reduce((acc, m) => 
            acc + (m.checkIns[m.checkIns.length - 1]?.progress || 0), 0) / milestones.length
        },
        analysis: JSON.parse(analysis.text())
      });
    } catch (error) {
      console.error('Error generating analytics:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Reminder generation route
  app.get('/api/reminders/generate/:userId', async (req, res) => {
    try {
      const user = await User.findById(req.params.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      const [reflections, milestones] = await Promise.all([
        Reflection.find({ userId: req.params.userId }).sort({ timestamp: -1 }).limit(5),
        Milestone.find({ 
          userId: req.params.userId,
          status: { $ne: 'completed' }
        })
      ]);
  
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      const prompt = `Generate personalized reminders and suggestions based on:
        User preferences: ${JSON.stringify(user.preferences)}
        Recent reflections: ${JSON.stringify(reflections)}
        Active milestones: ${JSON.stringify(milestones)}
        
        Provide a JSON response with:
        1. Reflection prompts
        2. Milestone check-in reminders
        3. Growth suggestions
        4. Habit reinforcement tips`;
  
      const result = await model.generateContent(prompt);
      const reminders = await result.response;
      
      res.json(JSON.parse(reminders.text()));
    } catch (error) {
      console.error('Error generating reminders:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Export relevant data route
  app.get('/api/export/:userId', async (req, res) => {
    try {
      const [user, reflections, milestones] = await Promise.all([
        User.findById(req.params.userId),
        Reflection.find({ userId: req.params.userId }),
        Milestone.find({ userId: req.params.userId })
      ]);
  
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      const exportData = {
        userProfile: {
          email: user.email,
          preferences: user.preferences,
          growthProfile: user.growthProfile,
          createdAt: user.createdAt
        },
        reflections: reflections.map(r => ({
          content: r.content,
          path: r.path,
          timestamp: r.timestamp,
          analysis: r.analysis,
          mediaType: r.mediaType
        })),
        milestones: milestones.map(m => ({
          title: m.title,
          description: m.description,
          path: m.path,
          targetDate: m.targetDate,
          status: m.status,
          checkIns: m.checkIns,
          aiRecommendations: m.aiRecommendations
        }))
      };
  
      res.json(exportData);
    } catch (error) {
      console.error('Error exporting data:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Start server
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Gemini-enhanced server running on port ${PORT}`);
  });
  
  // Create text index for search functionality
  Reflection.schema.index({ content: 'text' });
  
  module.exports = app;