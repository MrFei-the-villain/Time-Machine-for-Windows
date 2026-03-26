#!/bin/bash

# Configuration - Replace these with your actual values
REPO_OWNER="MrFei-the-villain"
REPO_NAME="Time-Machine-for-Windows"
VERSION="v1.0.0"

echo "==================================="
echo "Time Machine Clone - Release Builder"
echo "==================================="

# Step 1: Build the C# Engine
echo ""
echo "Step 1: Building C# Engine..."
cd engine
dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true
cd ..

# Step 2: Build Electron App
echo ""
echo "Step 2: Building Electron App..."
cd app
npm run build
cd ..

# Step 3: Create Git Tag
echo ""
echo "Step 3: Creating Git Tag..."
git tag $VERSION 2>/dev/null || git tag $VERSION

# Step 4: Add remote origin (if not exists)
echo ""
echo "Step 4: Adding remote origin..."
if git remote | grep -q "origin" > /dev/null; then
    echo "Remote origin already exists"
else
    git remote add origin https://github.com/$REPO_OWNER/$REPO_NAME.git
fi

# Step 5: Push to GitHub
echo ""
echo "Step 5: Pushing to GitHub..."
git push -u origin main
git push origin $VERSION

echo ""
echo "==================================="
echo "Build and push completed successfully!"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. Go to https://github.com/$REPO_OWNER/$REPO_NAME/releases"
echo "2. Click 'Draft a new release'"
echo "3. Select tag: $VERSION"
echo "4. Fill in title and description"
echo "5. Upload the installer: app/dist/Time Machine Setup 1.0.0.exe"
echo "6. Click 'Publish release'"
echo ""
