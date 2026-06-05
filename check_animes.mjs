import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI || "mongodb+srv://muhammaddiyorshokirov72_db_user:fuzhz6hMbg8wKeMO@cluster0.rlsdsgv.mongodb.net/subtitle_bot?appName=Cluster0";

async function run() {
  console.log("Connecting to URI:", uri);
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('subtitle_bot');
    
    const settingsColl = db.collection('settings');
    const settings = await settingsColl.find({}).toArray();
    console.log("SETTINGS IN DATABASE:");
    console.log(JSON.stringify(settings, null, 2));

    const collection = db.collection('automatedAnimes');
    const animes = await collection.find({}).sort({ createdAt: -1 }).limit(10).toArray();
    console.log("LAST 10 ANIMES IN DATABASE:");
    console.log(JSON.stringify(animes, null, 2));
  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await client.close();
  }
}

run();
