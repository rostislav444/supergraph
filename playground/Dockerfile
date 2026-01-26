FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY playground/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY playground/ ./

# Expose port
EXPOSE 3000

# Run dev server
CMD ["npm", "run", "dev"]
