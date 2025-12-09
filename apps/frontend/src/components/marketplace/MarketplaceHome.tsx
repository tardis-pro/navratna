import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Star, Download, TrendingUp, Search, Filter, Heart, Share2, Eye } from 'lucide-react';
import { MarketplaceItem, MarketplaceCategory, MarketplaceItemType } from '@uaip/types';

interface MarketplaceHomeProps {
  onItemClick?: (item: MarketplaceItem) => void;
}

export const MarketplaceHome: React.FC<MarketplaceHomeProps> = ({ onItemClick }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [featuredItems, setFeaturedItems] = useState<MarketplaceItem[]>([]);
  const [trendingItems, setTrendingItems] = useState<MarketplaceItem[]>([]);
  const [searchResults, setSearchResults] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Mock data for demo
  useEffect(() => {
    // In real implementation, fetch from API
    const mockFeatured: MarketplaceItem[] = [
      {
        id: '1',
        name: '🎯 UberAgent Pro',
        description:
          'Advanced AI agent that can handle complex multi-step tasks with 95% success rate',
        type: MarketplaceItemType.AGENT,
        category: MarketplaceCategory.PRODUCTIVITY,
        authorName: 'TechMaster',
        averageRating: 4.8,
        ratingCount: 1247,
        installationCount: 15420,
        tags: ['productivity', 'automation', 'enterprise'],
        isFeatured: true,
        isTrending: true,
        price: 0,
        pricingModel: 'free' as any,
        stats: {
          totalDownloads: 15420,
          totalInstalls: 15420,
          totalViews: 89234,
          weeklyDownloads: 892,
          monthlyDownloads: 3456,
        },
      },
      {
        id: '2',
        name: '🎨 CreativeGenius',
        description:
          'AI persona specialized in creative writing, storytelling, and content generation',
        type: MarketplaceItemType.PERSONA,
        category: MarketplaceCategory.CREATIVE,
        authorName: 'ArtistAI',
        averageRating: 4.9,
        ratingCount: 856,
        installationCount: 12340,
        tags: ['creative', 'writing', 'content'],
        isFeatured: true,
        price: 9.99,
        pricingModel: 'premium' as any,
        stats: {
          totalDownloads: 12340,
          totalInstalls: 12340,
          totalViews: 67890,
          weeklyDownloads: 567,
          monthlyDownloads: 2123,
        },
      },
    ] as MarketplaceItem[];

    const mockTrending: MarketplaceItem[] = [
      {
        id: '3',
        name: '🔥 ViralGPT',
        description: 'Generate viral social media content that gets 10x more engagement',
        type: MarketplaceItemType.AGENT,
        category: MarketplaceCategory.COMMUNICATION,
        authorName: 'SocialGuru',
        averageRating: 4.7,
        ratingCount: 2341,
        installationCount: 28540,
        tags: ['viral', 'social-media', 'engagement'],
        isTrending: true,
        trendingScore: 95.4,
        price: 0,
        pricingModel: 'freemium' as any,
        stats: {
          totalDownloads: 28540,
          totalInstalls: 28540,
          totalViews: 145670,
          weeklyDownloads: 4567,
          monthlyDownloads: 12890,
        },
      },
      {
        id: '4',
        name: '⚡ CodeNinja',
        description: 'Lightning-fast code generation and debugging assistant',
        type: MarketplaceItemType.TOOL,
        category: MarketplaceCategory.DEVELOPMENT,
        authorName: 'DevMaster',
        averageRating: 4.6,
        ratingCount: 1876,
        installationCount: 19876,
        tags: ['coding', 'debugging', 'productivity'],
        isTrending: true,
        trendingScore: 87.2,
        price: 19.99,
        pricingModel: 'premium' as any,
        stats: {
          totalDownloads: 19876,
          totalInstalls: 19876,
          totalViews: 98765,
          weeklyDownloads: 1234,
          monthlyDownloads: 4567,
        },
      },
    ] as MarketplaceItem[];

    setFeaturedItems(mockFeatured);
    setTrendingItems(mockTrending);
    setSearchResults([...mockFeatured, ...mockTrending]);
  }, []);

  const handleSearch = () => {
    setLoading(true);
    // Mock search delay
    setTimeout(() => {
      // In real implementation, call API with search filters
      setLoading(false);
    }, 500);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const ItemCard: React.FC<{ item: MarketplaceItem; featured?: boolean }> = ({
    item,
    featured,
  }) => (
    <Card
      className={`cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] ${
        featured ? 'border-2 border-blue-500 bg-gradient-to-br from-blue-50 to-purple-50' : ''
      }`}
      onClick={() => onItemClick?.(item)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              {item.name}
              {item.isTrending && (
                <Badge variant="destructive" className="text-xs">
                  🔥 TRENDING
                </Badge>
              )}
              {item.isFeatured && (
                <Badge variant="default" className="text-xs">
                  ⭐ FEATURED
                </Badge>
              )}
            </CardTitle>
            <p className="text-sm text-gray-600 mt-1">by {item.authorName}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-medium">{item.averageRating?.toFixed(1)}</span>
              <span className="text-xs text-gray-500">({formatNumber(item.ratingCount || 0)})</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Eye className="w-3 h-3" />
              <span>{formatNumber(item.stats?.totalViews || 0)}</span>
              <Download className="w-3 h-3" />
              <span>{formatNumber(item.installationCount || 0)}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-gray-700 mb-3 line-clamp-2">{item.description}</p>

        <div className="flex flex-wrap gap-1 mb-3">
          {item.tags?.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {item.type}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {item.category}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {item.price === 0 ? (
              <Badge variant="default" className="bg-green-500 text-xs">
                FREE
              </Badge>
            ) : (
              <span className="text-sm font-semibold">${item.price}</span>
            )}
            <Button size="sm" variant="outline" className="h-7 px-2">
              <Heart className="w-3 h-3 mr-1" />
              Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          🏪 AI Agent Marketplace
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Discover, share, and install the world's most powerful AI agents, personas, and tools
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-4 max-w-4xl mx-auto">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search agents, personas, tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-3 py-2 border rounded-md"
        >
          <option value="all">All Categories</option>
          {Object.values(MarketplaceCategory).map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="px-3 py-2 border rounded-md"
        >
          <option value="all">All Types</option>
          {Object.values(MarketplaceItemType).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <Button onClick={handleSearch} disabled={loading}>
          <Filter className="w-4 h-4 mr-2" />
          Search
        </Button>
      </div>

      {/* Featured Section */}
      <section>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          ⭐ Featured Items
          <Badge variant="secondary">Hand-picked by our team</Badge>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredItems.map((item) => (
            <ItemCard key={item.id} item={item} featured />
          ))}
        </div>
      </section>

      {/* Trending Section */}
      <section>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-red-500" />
          Trending Now
          <Badge variant="destructive">Hot this week</Badge>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {trendingItems.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      {/* Stats Bar */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-6 rounded-lg">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">12.5K+</div>
            <div className="text-sm opacity-90">AI Agents</div>
          </div>
          <div>
            <div className="text-2xl font-bold">8.3K+</div>
            <div className="text-sm opacity-90">Personas</div>
          </div>
          <div>
            <div className="text-2xl font-bold">5.7M+</div>
            <div className="text-sm opacity-90">Downloads</div>
          </div>
          <div>
            <div className="text-2xl font-bold">2.1M+</div>
            <div className="text-sm opacity-90">Active Users</div>
          </div>
        </div>
      </div>

      {/* Quick Categories */}
      <section>
        <h3 className="text-xl font-semibold mb-4">Browse by Category</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.values(MarketplaceCategory).map((category) => (
            <Card
              key={category}
              className="cursor-pointer hover:shadow-md transition-shadow text-center p-4"
              onClick={() => setSelectedCategory(category)}
            >
              <CardContent className="p-0">
                <div className="text-2xl mb-2">
                  {category === MarketplaceCategory.PRODUCTIVITY && '⚡'}
                  {category === MarketplaceCategory.CREATIVE && '🎨'}
                  {category === MarketplaceCategory.ANALYSIS && '📊'}
                  {category === MarketplaceCategory.COMMUNICATION && '💬'}
                  {category === MarketplaceCategory.DEVELOPMENT && '👨‍💻'}
                  {category === MarketplaceCategory.EDUCATION && '📚'}
                  {category === MarketplaceCategory.ENTERTAINMENT && '🎮'}
                  {category === MarketplaceCategory.BUSINESS && '💼'}
                  {category === MarketplaceCategory.RESEARCH && '🔬'}
                  {category === MarketplaceCategory.AUTOMATION && '🤖'}
                </div>
                <div className="text-sm font-medium capitalize">{category.replace('_', ' ')}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
};
