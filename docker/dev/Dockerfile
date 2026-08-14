FROM oven/bun:1-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and bun.lock first for efficient caching
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Copy the application code
COPY . .

# Expose the application port (change if your app uses a different port)
EXPOSE 3000

# Start the application
CMD [ "bun", "run", "dev" ]