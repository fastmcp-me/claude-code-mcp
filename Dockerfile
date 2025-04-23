# Dockerfile for claude-code-mcp
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Clone the repository
RUN git clone https://github.com/KunihiroS/claude-code-mcp.git

# Change directory to the server
WORKDIR /app/claude-code-mcp/claude-code-server

# Install npm dependencies
RUN npm install

# Build the project
RUN npm run build

# Expose port if needed (optional, adjust if your MCP server needs a specific port)
EXPOSE 3000

# Command to run the server
CMD ["node", "build/index.js"]