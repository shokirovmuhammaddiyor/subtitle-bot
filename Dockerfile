FROM node:20

# Install system dependencies (aria2 and ffmpeg)
RUN apt-get update && apt-get install -y \
    aria2 \
    ffmpeg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm install

# Copy application files
COPY . .

# Expose port (Render automatically maps this)
EXPOSE 3000

# Start command
CMD ["npm", "start"]
