require('dotenv').config();
const { MongoClient } = require('mongodb');
const OpenAI = require('openai');

// Database class for MongoDB connection
class Database {
  constructor() {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    if (!process.env.MONGODB_URI.startsWith('mongodb://') && 
        !process.env.MONGODB_URI.startsWith('mongodb+srv://')) {
      throw new Error('Invalid MongoDB URI format. URI must start with "mongodb://" or "mongodb+srv://"');
    }

    this.client = new MongoClient(process.env.MONGODB_URI);
  }

  async connect() {
    try {
      await this.client.connect();
      console.log('Connected to MongoDB');
      
      if (!process.env.DB_NAME) {
        throw new Error('DB_NAME environment variable is not set');
      }
      
      return this.client.db(process.env.DB_NAME);
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      await this.client.close();
      console.log('Disconnected from MongoDB');
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error);
    }
  }
}

// JobService class for interacting with job data in MongoDB


// OpenAIService class to handle OpenAI requests
class OpenAIService {
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateResponse(jobData, userQuery) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "system",
          content: `You are helpful assistant representing Outpace Consulting. You share open job profiles details with candidates as attached in the array. If user asks for a specific location opening, and its not there in the files then show the openings for the nearest available location. There might be several locations for a single job profile.`
        }, {
          role: "user",
          content: `Here are the job openings:\n\n${jobData}\n\nUser query: "${userQuery}"\n\nBased on the user's query, recommend the most suitable job openings. If none match, explain accordingly.`
        }],
        temperature: 0.7,
        max_tokens: 500
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw error;
    }
  }
}

class JobService {
  constructor(db) {
    if (!process.env.COLLECTION_NAME) {
      throw new Error('COLLECTION_NAME environment variable is not set');
    }
    this.collection = db.collection(process.env.COLLECTION_NAME);
  }

  async findJobs(query) {
    try {
      return await this.collection.find(query).toArray();
    } catch (error) {
      console.error('Error fetching jobs:', error);
      throw error;
    }
  }

  formatJobData(jobs) {
    return jobs.map(job => `
Job Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Salary: ${job.salary || 'Not specified'}
Apply Here: ${job.link}
-------------------
`).join('\n');
  }

  // Build a basic query structure, can be extended if needed for better filtering
  buildQuery() {
    return {};  // You can decide on your query structure here (e.g., for filtering specific job types)
  }
}

async function main(userQuery) {
  const dbInstance = new Database();
  let database = null;

  try {
    const openAIService = new OpenAIService();
    database = await dbInstance.connect();
    const jobService = new JobService(database);

    // Get all jobs from the database (you can filter them server-side later if needed)
    const jobs = await jobService.findJobs({});

    if (jobs.length === 0) {
      console.log("No job openings found.");
      return;
    }

    // Format job data for GPT-3
    const formattedJobs = jobService.formatJobData(jobs);

    // Send entire user query to OpenAI, let it handle the parsing and matching
    const response = await openAIService.generateResponse(formattedJobs, userQuery);

    console.log('Assistant Response:\n', response);
  } catch (error) {
    console.error('Application error:', error);
  } finally {
    if (database) {
      await dbInstance.disconnect();
    }
  }
}

// Example usage with a natural language query
const userQueryText = "jobs in gurgaon";
main(userQueryText);