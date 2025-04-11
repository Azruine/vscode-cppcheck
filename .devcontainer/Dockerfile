FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

# Install Cppcheck for testing the extension
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install cppcheck \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*
