# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install project dependencies
# Use 'npm ci' for cleaner, more reliable builds in CI/CD environments
RUN npm ci

# Copy the rest of the application's source code from your host to your image filesystem.
COPY . .

# Make port 3000 available to the world outside this container
EXPOSE 3000

# Run the app when the container launches
# This will start both the server and the worker as defined in your package.json
CMD ["npm", "run", "dev:all"]
