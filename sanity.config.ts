import { defineConfig } from 'sanity';
import { deskTool } from 'sanity/desk';
import type { StructureBuilder } from 'sanity/structure';
import { schema } from './sanity/schema';

export default defineConfig({
  name: 'default',
  title: 'WEVE DESIGN 관리',

  projectId: 'q2qjj1se',
  dataset: 'production',

  basePath: '/studio-weve-3891',

  plugins: [
    deskTool({
      structure: (S: StructureBuilder) =>
        S.list()
          .title('WEVE DESIGN 관리')
          .items([
            S.listItem()
              .title('홈페이지 전체 수정')
              .id('siteSettings')
              .schemaType('siteSettings')
              .child(
                S.document()
                  .schemaType('siteSettings')
                  .documentId('siteSettings')
                  .title('홈페이지 전체 수정'),
              ),
            S.divider(),
            S.documentTypeListItem('project').title('Project'),
            S.documentTypeListItem('category').title('공간 분류'),
          ]),
    }),
  ],

  schema,
});
