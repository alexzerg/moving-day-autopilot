FROM public.ecr.aws/docker/library/node:22-slim
WORKDIR /app
COPY package.agentcore.json package.json
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force
COPY dist/agentcore.js dist/agentcore.js
COPY dist/agentcore.js.map dist/agentcore.js.map
ENV NODE_ENV=production PORT=8080 AWS_REGION=us-east-1 BEDROCK_MODEL_ID=us.amazon.nova-2-lite-v1:0
EXPOSE 8080
USER node
CMD ["node", "dist/agentcore.js"]
