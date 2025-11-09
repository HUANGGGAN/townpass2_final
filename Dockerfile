# Use the specified Debian base image
FROM debian:12.9-slim

# 1. Install necessary prerequisites (curl, gnupg, and CA-CERTIFICATES)
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 2. Install Node.js (Current LTS version 20 via NodeSource)
# This adds the NodeSource repository and installs nodejs/npm
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# 3. Create and set the working directory for the application
WORKDIR /opt/backend/

# 4. Copy package files first for dependency caching
# This assumes package.json is inside your local 'backend/' directory.
# We copy it to the current WORKDIR (/opt/backend/).
COPY backend/package*.json ./

# 5. Install Node dependencies (all dependencies are installed)
RUN npm install

# 6. Copy the rest of the application source code
# We copy the rest of the source files from 'backend/' to the current WORKDIR (./)
COPY backend/ .

# 7. Expose the port (3000 by default, based on your ENV)
EXPOSE 3000

# 8. Command to run the application (start the server)
# FORCED EXECUTION: We use 'sh -c' to explicitly execute the build, then the start command
CMD sh -c "npm run build && npm start"
