import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/blog' }),
  schema: z.object({
    draft: z.boolean().default(false),
    title: z.string(),
  }),
});

export const collections = { blog };
