const express = require('express');
const cors = require('cors');
const app = express();
const http = require("http"); // Required for WebSockets
const { Server } = require("socket.io");
const port = process.env.PORT || 5000;
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');

app.use(cors());
app.use(express.json());

// Create HTTP server for WebSockets
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vo9th.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

     const taskCollection = client.db("TaskDB").collection("tasks");

        //  **WebSocket Connection**
    io.on("connection", (socket) => {
        console.log("A user connected ");
  
        socket.on("disconnect", () => {
          console.log("User disconnected ");
        });
      });

    // GET - Retrieve Tasks**
    app.get("/tasks", async (req, res) => {
        const tasks = await taskCollection.find().toArray();
        res.json(tasks);
      });

         //  POST - Add a Task**
    app.post("/tasks", async (req, res) => {
        const { title, description, status } = req.body;
        if (!title || title.length > 50) return res.status(400).json({ error: "Title is required (max 50 chars)" });
        if (description && description.length > 200) return res.status(400).json({ error: "Description max 200 chars" });
  
        const newTask = { title, description, status, createdAt: new Date() };
        const result = await taskCollection.insertOne(newTask);
  
        // Send real-time update
        io.emit("task-updated");
        res.json(result);
      });

        // PUT - Update a Task**
        app.put("/tasks/:id", async (req, res) => {
            const { id } = req.params;
            const { title, description, status } = req.body;
      
            await taskCollection.updateOne({ _id: new ObjectId(id) }, { $set: { title, description, status } });
      
            // Send real-time update
            io.emit("task-updated");
            res.json({ message: "Task updated" });
          });

            // DELETE - Remove a Task**
    app.delete("/tasks/:id", async (req, res) => {
        const { id } = req.params;
        await taskCollection.deleteOne({ _id: new ObjectId(id) });
  
        // Send real-time update
        io.emit("task-updated");
        res.json({ message: "Task deleted" });
      });
  
    } catch (error) {
      console.error(error);
    }
  }
  
  

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('task is falling from sky')
})

app.listen(port, () => {
    console.log(`Task is running at port: ${port}`)
})