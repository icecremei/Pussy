'use client';

import { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactMarkdown from 'react-markdown';
import Image from 'next/image';
import { Sparkles, Image as ImageIcon, Loader2, Key, AlertCircle } from 'lucide-react';

// Define types
type Tone = 'professional' | 'witty' | 'urgent';
type ImageSize = '1K' | '2K' | '4K';
type AspectRatio = 'platform-optimal' | '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9' | '21:9';

interface GeneratedContent {
  text: string;
  imagePrompt: string;
}

interface PlatformContent {
  linkedin: GeneratedContent | null;
  twitter: GeneratedContent | null;
  instagram: GeneratedContent | null;
}

interface GeneratedImages {
  linkedin: string | null;
  twitter: string | null;
  instagram: string | null;
}

export default function SocialMediaGenerator() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [idea, setIdea] = useState('');
  const [tone, setTone] = useState<Tone>('professional');
  const [imageSize, setImageSize] = useState<ImageSize>('1K');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('platform-optimal');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [content, setContent] = useState<PlatformContent>({
    linkedin: null,
    twitter: null,
    instagram: null,
  });
  const [images, setImages] = useState<GeneratedImages>({
    linkedin: null,
    twitter: null,
    instagram: null,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      try {
        // @ts-ignore
        if (window.aistudio && window.aistudio.hasSelectedApiKey) {
          // @ts-ignore
          const selected = await window.aistudio.hasSelectedApiKey();
          setHasKey(selected);
        } else {
          // Fallback if not in AI Studio environment
          setHasKey(!!process.env.NEXT_PUBLIC_GEMINI_API_KEY);
        }
      } catch (e) {
        setHasKey(!!process.env.NEXT_PUBLIC_GEMINI_API_KEY);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    try {
      // @ts-ignore
      if (window.aistudio && window.aistudio.openSelectKey) {
        // @ts-ignore
        await window.aistudio.openSelectKey();
        // Assume success to avoid race conditions
        setHasKey(true);
      }
    } catch (e: any) {
      if (e.message?.includes('Requested entity was not found')) {
        setHasKey(false);
      }
    }
  };

  const generateContent = async () => {
    if (!idea.trim()) {
      setError('Please enter an idea first.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setContent({ linkedin: null, twitter: null, instagram: null });
    setImages({ linkedin: null, twitter: null, instagram: null });

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
      
      // 1. Generate text and image prompts
      const prompt = `
        You are an expert social media manager. I have an idea for a post:
        "${idea}"
        
        The desired tone is: ${tone}.
        
        Please generate drafted posts tailored for:
        1. LinkedIn (long-form, professional formatting)
        2. Twitter/X (short, punchy, under 280 characters)
        3. Instagram (visual-focused, engaging caption, with relevant hashtags)
        
        Also, for each platform, generate a highly detailed and descriptive image generation prompt that perfectly accompanies the post.
        
        Return the result EXACTLY as a JSON object with this structure:
        {
          "linkedin": { "text": "...", "imagePrompt": "..." },
          "twitter": { "text": "...", "imagePrompt": "..." },
          "instagram": { "text": "...", "imagePrompt": "..." }
        }
      `;

      const textResponse = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      const generatedData = JSON.parse(textResponse.text || '{}') as PlatformContent;
      setContent(generatedData);

      // 2. Generate images in parallel
      const generateImageForPlatform = async (
        platform: 'linkedin' | 'twitter' | 'instagram', 
        imagePrompt: string
      ) => {
        let targetAspectRatio = aspectRatio;
        if (aspectRatio === 'platform-optimal') {
          if (platform === 'linkedin') targetAspectRatio = '4:3';
          else if (platform === 'twitter') targetAspectRatio = '16:9';
          else if (platform === 'instagram') targetAspectRatio = '1:1';
        }

        try {
          const imageResponse = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: imagePrompt,
            config: {
              // @ts-ignore - The types might not have imageConfig yet
              imageConfig: {
                aspectRatio: targetAspectRatio,
                imageSize: imageSize
              }
            }
          });

          // Extract base64 image
          const parts = imageResponse.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.inlineData) {
              return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
          }
        } catch (err) {
          console.error(`Failed to generate image for ${platform}:`, err);
          return null;
        }
        return null;
      };

      const [linkedinImg, twitterImg, instagramImg] = await Promise.all([
        generatedData.linkedin?.imagePrompt ? generateImageForPlatform('linkedin', generatedData.linkedin.imagePrompt) : Promise.resolve(null),
        generatedData.twitter?.imagePrompt ? generateImageForPlatform('twitter', generatedData.twitter.imagePrompt) : Promise.resolve(null),
        generatedData.instagram?.imagePrompt ? generateImageForPlatform('instagram', generatedData.instagram.imagePrompt) : Promise.resolve(null),
      ]);

      setImages({
        linkedin: linkedinImg,
        twitter: twitterImg,
        instagram: instagramImg,
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (hasKey === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (hasKey === false) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-4">
              <Key className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>API Key Required</CardTitle>
            <CardDescription>
              To generate high-quality images with Gemini 3 Pro Image, you need to select a paid Google Cloud API key.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleSelectKey} className="w-full">
              Select API Key
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-4">
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline">
                Learn more about billing
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 flex items-center justify-center gap-2">
            <Sparkles className="w-8 h-8 text-primary" />
            SocialAI Generator
          </h1>
          <p className="text-slate-500 max-w-2xl mx-auto">
            Transform a single idea into tailored posts for LinkedIn, Twitter, and Instagram, complete with custom generated images.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Controls Sidebar */}
          <Card className="lg:col-span-4 h-fit">
            <CardHeader>
              <CardTitle>Content Settings</CardTitle>
              <CardDescription>Configure your post generation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="idea">What&apos;s your idea?</Label>
                <Textarea 
                  id="idea" 
                  placeholder="e.g., The importance of taking breaks during deep work sessions..."
                  className="min-h-[120px] resize-none"
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  disabled={isGenerating}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tone">Tone of Voice</Label>
                <Select value={tone} onValueChange={(v) => setTone(v as Tone)} disabled={isGenerating}>
                  <SelectTrigger id="tone">
                    <SelectValue placeholder="Select tone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="witty">Witty & Clever</SelectItem>
                    <SelectItem value="urgent">Urgent & Compelling</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="imageSize">Image Quality</Label>
                <Select value={imageSize} onValueChange={(v) => setImageSize(v as ImageSize)} disabled={isGenerating}>
                  <SelectTrigger id="imageSize">
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1K">1K (Standard)</SelectItem>
                    <SelectItem value="2K">2K (High Quality)</SelectItem>
                    <SelectItem value="4K">4K (Ultra HD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="aspectRatio">Aspect Ratio</Label>
                <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as AspectRatio)} disabled={isGenerating}>
                  <SelectTrigger id="aspectRatio">
                    <SelectValue placeholder="Select aspect ratio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="platform-optimal">Platform Optimal (Auto)</SelectItem>
                    <SelectItem value="1:1">1:1 (Square)</SelectItem>
                    <SelectItem value="2:3">2:3 (Portrait)</SelectItem>
                    <SelectItem value="3:2">3:2 (Landscape)</SelectItem>
                    <SelectItem value="3:4">3:4 (Portrait)</SelectItem>
                    <SelectItem value="4:3">4:3 (Landscape)</SelectItem>
                    <SelectItem value="9:16">9:16 (Vertical)</SelectItem>
                    <SelectItem value="16:9">16:9 (Widescreen)</SelectItem>
                    <SelectItem value="21:9">21:9 (Ultrawide)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-md flex items-start gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                size="lg" 
                onClick={generateContent}
                disabled={isGenerating || !idea.trim()}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating Magic...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Content
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Results Area */}
          <div className="lg:col-span-8">
            <Tabs defaultValue="linkedin" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
                <TabsTrigger value="twitter">Twitter / X</TabsTrigger>
                <TabsTrigger value="instagram">Instagram</TabsTrigger>
              </TabsList>
              
              {['linkedin', 'twitter', 'instagram'].map((platform) => (
                <TabsContent key={platform} value={platform} className="mt-0">
                  <Card className="overflow-hidden border-0 shadow-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 h-full">
                      {/* Image Section */}
                      <div className="bg-slate-100 flex items-center justify-center p-6 min-h-[300px] md:min-h-[500px] border-b md:border-b-0 md:border-r border-slate-200 relative">
                        {isGenerating ? (
                          <div className="flex flex-col items-center text-slate-400 gap-4">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <p className="text-sm font-medium">Generating image...</p>
                          </div>
                        ) : images[platform as keyof GeneratedImages] ? (
                          <div className="relative w-full h-full flex items-center justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                              src={images[platform as keyof GeneratedImages]!} 
                              alt={`Generated for ${platform}`}
                              className="max-w-full max-h-full object-contain rounded-md shadow-sm"
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center text-slate-400 gap-2">
                            <ImageIcon className="w-12 h-12 opacity-50" />
                            <p className="text-sm font-medium">No image generated yet</p>
                          </div>
                        )}
                      </div>
                      
                      {/* Text Section */}
                      <div className="flex flex-col h-full max-h-[500px]">
                        <div className="p-4 border-b bg-slate-50/50">
                          <h3 className="font-semibold text-sm text-slate-500 uppercase tracking-wider">
                            Post Draft
                          </h3>
                        </div>
                        <ScrollArea className="flex-1 p-6">
                          {isGenerating ? (
                            <div className="space-y-4">
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-[90%]" />
                              <Skeleton className="h-4 w-[95%]" />
                              <Skeleton className="h-4 w-[80%]" />
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-[85%]" />
                            </div>
                          ) : content[platform as keyof PlatformContent]?.text ? (
                            <div className="prose prose-sm max-w-none prose-slate">
                              <ReactMarkdown>
                                {content[platform as keyof PlatformContent]!.text}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                              Your generated post will appear here.
                            </div>
                          )}
                        </ScrollArea>
                        
                        {content[platform as keyof PlatformContent]?.imagePrompt && !isGenerating && (
                          <div className="p-4 bg-slate-50 border-t text-xs text-slate-500">
                            <span className="font-semibold block mb-1">Image Prompt Used:</span>
                            <span className="line-clamp-2" title={content[platform as keyof PlatformContent]!.imagePrompt}>
                              {content[platform as keyof PlatformContent]!.imagePrompt}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
