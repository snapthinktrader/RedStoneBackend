#!/bin/bash

# RedStone Professional Deployment Script
# Deploys backend and automatically updates stable domain

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

STABLE_DOMAIN="red-stone-backend.vercel.app"

echo -e "${BLUE}🚀 RedStone Professional Deployment${NC}"
echo "====================================="

# Function to deploy backend
deploy_backend() {
    echo -e "${BLUE}📡 Deploying backend to Vercel...${NC}"
    
    # Deploy to production
    vercel --prod
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Backend deployed successfully!${NC}"
        return 0
    else
        echo -e "${RED}❌ Backend deployment failed!${NC}"
        return 1
    fi
}

# Function to update stable domain
update_stable_domain() {
    echo -e "${BLUE}🔗 Updating stable domain...${NC}"
    
    # Get latest deployment URL
    LATEST_URL=$(vercel ls --format json | jq -r '.[0].url' 2>/dev/null || echo "")
    
    if [ -n "$LATEST_URL" ] && [ "$LATEST_URL" != "null" ]; then
        FULL_URL="https://$LATEST_URL"
        echo -e "${BLUE}Latest deployment: $FULL_URL${NC}"
        
        # Update alias
        vercel alias "$FULL_URL" "$STABLE_DOMAIN"
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Stable domain updated: https://$STABLE_DOMAIN${NC}"
            return 0
        else
            echo -e "${RED}❌ Failed to update stable domain${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ Could not get latest deployment URL${NC}"
        return 1
    fi
}

# Function to test the stable domain
test_stable_domain() {
    echo -e "${BLUE}🧪 Testing stable domain...${NC}"
    
    # Test if domain responds
    if curl -s -I "https://$STABLE_DOMAIN/api" > /dev/null; then
        echo -e "${GREEN}✅ Stable domain is responding${NC}"
        return 0
    else
        echo -e "${RED}❌ Stable domain is not responding${NC}"
        return 1
    fi
}

# Main execution
case "${1:-deploy}" in
    "deploy")
        echo -e "${BLUE}🤖 Full deployment process${NC}"
        
        if deploy_backend; then
            sleep 2  # Wait for deployment to propagate
            
            if update_stable_domain; then
                sleep 2  # Wait for alias to propagate
                test_stable_domain
                
                echo -e "${GREEN}🎉 Professional deployment complete!${NC}"
                echo -e "${BLUE}Your app will now automatically use: https://$STABLE_DOMAIN/api${NC}"
                echo -e "${YELLOW}No need to rebuild Flutter app - it uses the stable URL!${NC}"
            fi
        fi
        ;;
    "alias")
        update_stable_domain
        ;;
    "test")
        test_stable_domain
        ;;
    "status")
        echo -e "${BLUE}📊 Current Status:${NC}"
        echo "Stable domain: https://$STABLE_DOMAIN"
        
        LATEST_URL=$(vercel ls --format json | jq -r '.[0].url' 2>/dev/null || echo "")
        if [ -n "$LATEST_URL" ] && [ "$LATEST_URL" != "null" ]; then
            echo "Latest deployment: https://$LATEST_URL"
        fi
        
        test_stable_domain
        ;;
    "help"|"-h"|"--help")
        echo "RedStone Professional Deployment"
        echo ""
        echo "Commands:"
        echo "  deploy   Deploy backend and update stable domain (default)"
        echo "  alias    Update stable domain alias only"
        echo "  test     Test if stable domain is responding"
        echo "  status   Show current deployment status"
        echo "  help     Show this help"
        echo ""
        echo "The stable domain (red-stone-backend.vercel.app) never changes!"
        echo "Your Flutter app always connects to this stable URL."
        echo ""
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $1${NC}"
        echo "Use './deploy.sh help' for usage"
        exit 1
        ;;
esac