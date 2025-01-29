#!/bin/bash

curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "What is MongoDB?"}'
